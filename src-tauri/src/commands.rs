use std::sync::Mutex;
use tauri::State;

use crate::db::Database;
use crate::models::{
    BackupInfo, Department, Employee, EmployeeStationAssignment, NewRecordInput, PayrollSummary, ProcessItem,
    ProcessPriceVersion, ProcessStats, ProductModel, ProductProcessRoute, RouteStepInput, Station, StationSummary, SystemStats, Team, TeamBatchRecordInput,
    WorkRecord, Workshop,
};

pub struct AppState {
    pub db: Mutex<Database>,
}

// --- 部门架构管理 IPC ---
#[tauri::command]
pub fn get_departments(state: State<AppState>) -> Result<Vec<Department>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_departments()
}

#[tauri::command]
pub fn save_department(dept: Department, state: State<AppState>) -> Result<Department, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.save_department(dept)
}

#[tauri::command]
pub fn delete_department(id: i64, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.delete_department(id)
}

// --- 班组独立管理 IPC ---
#[tauri::command]
pub fn get_teams(state: State<AppState>) -> Result<Vec<Team>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_teams()
}

#[tauri::command]
pub fn save_team(team: Team, state: State<AppState>) -> Result<Team, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.save_team(team)
}

#[tauri::command]
pub fn delete_team(id: i64, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.delete_team(id)
}

// --- 工段与站点管理 IPC ---
#[tauri::command]
pub fn get_workshops(state: State<AppState>) -> Result<Vec<Workshop>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_workshops()
}

#[tauri::command]
pub fn get_stations(
    workshop_id_filter: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<Station>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_stations(workshop_id_filter)
}

#[tauri::command]
pub fn save_station(
    station: Station,
    state: State<AppState>,
) -> Result<Station, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.save_station(station)
}

// --- 员工与站点分配管理 IPC ---
#[tauri::command]
pub fn get_employees(
    status_filter: Option<String>,
    state: State<AppState>,
) -> Result<Vec<Employee>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_employees(status_filter)
}

#[tauri::command]
pub fn add_employee(
    emp: Employee,
    state: State<AppState>,
) -> Result<Employee, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.add_employee(emp)
}

#[tauri::command]
pub fn update_employee(
    emp: Employee,
    state: State<AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.update_employee(emp)
}

#[tauri::command]
pub fn delete_employee(
    id: i64,
    state: State<AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.delete_employee(id)
}

#[tauri::command]
pub fn assign_employee_station(
    emp_id: i64,
    station_id: i64,
    assignment_type: String,
    effective_from: String,
    effective_to: Option<String>,
    state: State<AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.assign_employee_station(emp_id, station_id, assignment_type, effective_from, effective_to)
}

#[tauri::command]
pub fn get_station_employees(
    station_id: i64,
    state: State<AppState>,
) -> Result<Vec<EmployeeStationAssignment>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_station_employees(station_id)
}

// --- 工艺工序与工价版本 IPC ---
#[tauri::command]
pub fn get_processes(
    station_id_filter: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<ProcessItem>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_processes(station_id_filter)
}

#[tauri::command]
pub fn save_process_with_pricing(
    proc: ProcessItem,
    version_tag: String,
    state: State<AppState>,
) -> Result<ProcessItem, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.save_process_with_pricing(proc, version_tag)
}

#[tauri::command]
pub fn get_process_price_history(
    process_id: i64,
    state: State<AppState>,
) -> Result<Vec<ProcessPriceVersion>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_process_price_history(process_id)
}

#[tauri::command]
pub fn delete_process(
    id: i64,
    state: State<AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.delete_process(id)
}

// --- 生产计件报工流水 IPC ---
#[tauri::command]
pub fn get_records(
    start_date: Option<String>,
    end_date: Option<String>,
    station_id: Option<i64>,
    emp_id: Option<i64>,
    process_id: Option<i64>,
    batch_no: Option<String>,
    state: State<AppState>,
) -> Result<Vec<WorkRecord>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_records(start_date, end_date, station_id, emp_id, process_id, batch_no)
}

#[tauri::command]
pub fn add_record(
    input: NewRecordInput,
    state: State<AppState>,
) -> Result<WorkRecord, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.add_record(input)
}

#[tauri::command]
pub fn add_team_batch_record(
    input: TeamBatchRecordInput,
    state: State<AppState>,
) -> Result<Vec<WorkRecord>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.add_team_batch_record(input)
}

#[tauri::command]
pub fn delete_record(
    id: i64,
    state: State<AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.delete_record(id)
}

#[tauri::command]
pub fn settle_records(
    ids: Vec<i64>,
    target_status: i64,
    state: State<AppState>,
) -> Result<usize, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.settle_records(ids, target_status)
}

// --- 统计、汇总与导出 IPC ---
#[tauri::command]
pub fn get_payroll_summary(
    start_date: Option<String>,
    end_date: Option<String>,
    station_id: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<PayrollSummary>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_payroll_summary(start_date, end_date, station_id)
}

#[tauri::command]
pub fn get_station_summary(
    start_date: Option<String>,
    end_date: Option<String>,
    state: State<AppState>,
) -> Result<Vec<StationSummary>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_station_summary(start_date, end_date)
}

#[tauri::command]
pub fn get_process_stats(
    start_date: Option<String>,
    end_date: Option<String>,
    workshop_id: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<ProcessStats>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_process_stats(start_date, end_date, workshop_id)
}

#[tauri::command]
pub fn get_system_stats(state: State<AppState>) -> Result<SystemStats, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_system_stats()
}

#[tauri::command]
pub fn backup_database(state: State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.backup_database()
}

#[tauri::command]
pub fn list_backups(state: State<AppState>) -> Result<Vec<BackupInfo>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.list_backups()
}

#[tauri::command]
pub fn restore_backup(filename: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.restore_backup(&filename)
}

#[tauri::command]
pub fn delete_backup(filename: String, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.delete_backup(&filename)
}

#[tauri::command]
pub fn open_backup_folder(state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.open_backup_folder()
}

#[tauri::command]
pub fn export_csv_records(
    start_date: Option<String>,
    end_date: Option<String>,
    station_id: Option<i64>,
    state: State<AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    let records = db.get_records(start_date, end_date, station_id, None, None, None)?;

    // 带 UTF-8 BOM 标头，保证 Excel 打开中文不乱码
    let mut csv = String::from("\u{FEFF}");
    csv.push_str("流水号,报工日期,生产工单批次,所属工段,作业站点代码,作业站点名称,员工工号,员工姓名,所属班组,工艺代码,工艺名称,适用规格型号,合格数量,废品数量,工价单价快照,计件金额,核算锁定状态,录入时间,备注\n");

    for r in records {
        let settled_str = if r.settled == 1 { "已结算锁定" } else { "未结算" };
        let line = format!(
            "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{:.2},{:.2},{},{},\"{}\"\n",
            r.id.unwrap_or(0),
            r.record_date,
            r.batch_no,
            r.workshop_name.unwrap_or_default(),
            r.station_code.unwrap_or_default(),
            r.station_name.unwrap_or_default(),
            r.emp_code.unwrap_or_default(),
            r.emp_name.unwrap_or_default(),
            r.department.unwrap_or_default(),
            r.process_code.unwrap_or_default(),
            r.process_name.unwrap_or_default(),
            r.product_spec.unwrap_or_default(),
            r.quantity,
            r.scrap_quantity,
            r.unit_price,
            r.total_amount,
            settled_str,
            r.created_at.unwrap_or_default(),
            r.notes.replace('"', "\"\"")
        );
        csv.push_str(&line);
    }

    Ok(csv)
}

#[tauri::command]
pub fn export_csv_payroll(
    start_date: Option<String>,
    end_date: Option<String>,
    station_id: Option<i64>,
    state: State<AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    let payroll = db.get_payroll_summary(start_date, end_date, station_id)?;

    let mut csv = String::from("\u{FEFF}");
    csv.push_str("员工工号,姓名,所属班组,常驻主站点,记工笔数,累计合格件数,废品总件数,应发计件工资,已核算锁定笔数,待核算笔数\n");

    for p in payroll {
        let line = format!(
            "{},{},{},{},{},{},{},{:.2},{},{}\n",
            p.emp_code,
            p.emp_name,
            p.department,
            p.primary_station_name.unwrap_or_default(),
            p.total_records,
            p.total_pieces,
            p.total_scrap,
            p.total_amount,
            p.settled_records,
            p.unsettled_records
        );
        csv.push_str(&line);
    }

    Ok(csv)
}

#[tauri::command]
pub fn export_csv_stations(
    start_date: Option<String>,
    end_date: Option<String>,
    state: State<AppState>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    let summaries = db.get_station_summary(start_date, end_date)?;

    let mut csv = String::from("\u{FEFF}");
    csv.push_str("站点代码,站点名称,所属工段,责任班长,合格总产出,废品总数,站点工费总支出,记工流水笔数\n");

    for s in summaries {
        let line = format!(
            "{},{},{},{},{},{},{:.2},{}\n",
            s.station_code,
            s.station_name,
            s.workshop_name,
            s.supervisor,
            s.total_pieces,
            s.total_scrap,
            s.total_amount,
            s.record_count
        );
        csv.push_str(&line);
    }

    Ok(csv)
}

#[tauri::command]
pub fn clear_all_data(state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.clear_all_data()
}

// --- 产品型号管理 IPC ---
#[tauri::command]
pub fn get_product_models(state: State<AppState>) -> Result<Vec<ProductModel>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_product_models()
}

#[tauri::command]
pub fn save_product_model(
    model: ProductModel,
    state: State<AppState>,
) -> Result<ProductModel, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.save_product_model(model)
}

#[tauri::command]
pub fn delete_product_model(
    id: i64,
    state: State<AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.delete_product_model(id)
}

#[tauri::command]
pub fn get_next_product_code(state: State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_next_product_code()
}

#[tauri::command]
pub fn get_hole_specs(state: State<AppState>) -> Result<Vec<i64>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_hole_specs()
}

#[tauri::command]
pub fn add_hole_spec(hole_count: i64, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.add_hole_spec(hole_count)
}

#[tauri::command]
pub fn delete_hole_spec(hole_count: i64, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.delete_hole_spec(hole_count)
}

// --- 产品工位工艺流程路线 (MES Product Routing) IPC ---

#[tauri::command]
pub fn get_product_routes(model_id: i64, state: State<AppState>) -> Result<Vec<ProductProcessRoute>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_product_routes(model_id)
}

#[tauri::command]
pub fn save_product_routes(model_id: i64, steps: Vec<RouteStepInput>, state: State<AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.save_product_routes(model_id, steps)
}

#[tauri::command]
pub fn get_all_product_routes_summary(state: State<AppState>) -> Result<std::collections::HashMap<i64, Vec<ProductProcessRoute>>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_all_product_routes_summary()
}

#[tauri::command]
pub fn get_stations_by_product(model_id: i64, state: State<AppState>) -> Result<Vec<Station>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_stations_by_product(model_id)
}

#[tauri::command]
pub fn get_processes_by_product_station(model_id: i64, station_id: i64, state: State<AppState>) -> Result<Vec<ProcessItem>, String> {
    let db = state.db.lock().map_err(|e| format!("[CRITICAL] 获取数据库锁失败: {}", e))?;
    db.get_processes_by_product_station(model_id, station_id)
}


