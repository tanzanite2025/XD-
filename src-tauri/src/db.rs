use rusqlite::{params, Connection, Result};
use std::fs;
use std::path::{Path, PathBuf};
use chrono::Local;

use crate::models::{
    BackupInfo, Department, Employee, EmployeeStationAssignment, NewRecordInput, PayrollSummary, ProcessItem,
    ProcessPriceVersion, ProcessStats, ProductModel, Station, StationSummary, SystemStats, Team, TeamBatchRecordInput,
    WorkRecord, Workshop,
};

pub struct Database {
    db_path: PathBuf,
}

impl Database {
    pub fn new() -> std::result::Result<Self, String> {
        let data_dir = PathBuf::from("data");
        if !data_dir.exists() {
            fs::create_dir_all(&data_dir)
                .map_err(|e| format!("[CRITICAL] 创建数据存储目录失败: {}", e))?;
        }

        let backups_dir = data_dir.join("backups");
        if !backups_dir.exists() {
            let _ = fs::create_dir_all(&backups_dir);
        }

        let db_path = data_dir.join("piecework.db");
        let db = Database { db_path };
        db.init_schema()
            .map_err(|e| format!("[CRITICAL] 初始化数据库架构失败: {}", e))?;

        if let Err(e) = db.seed_carbon_fiber_factory_data() {
            eprintln!("[WARN] 碳纤维生产线基础数据初始化提示: {}", e);
        }

        Ok(db)
    }

    fn get_conn(&self) -> Result<Connection> {
        Connection::open(&self.db_path)
    }

    fn init_schema(&self) -> Result<()> {
        let conn = self.get_conn()?;

        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            -- 1. 工厂工段表 (前段/后段)
            CREATE TABLE IF NOT EXISTS workshops (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workshop_code TEXT NOT NULL UNIQUE,
                workshop_name TEXT NOT NULL,
                description TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'ACTIVE'
            );

            -- 2. 车间站点字典表 (可配置站点)
            CREATE TABLE IF NOT EXISTS stations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workshop_id INTEGER NOT NULL REFERENCES workshops(id),
                station_code TEXT NOT NULL UNIQUE,
                station_name TEXT NOT NULL,
                supervisor TEXT DEFAULT '',
                target_output_daily INTEGER DEFAULT 0,
                sort_order INTEGER DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'ACTIVE'
            );

            -- 3. 员工档案表
            CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                emp_code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                department TEXT NOT NULL,
                primary_station_id INTEGER REFERENCES stations(id),
                skill_level TEXT DEFAULT '中级技工',
                phone TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                created_at TEXT NOT NULL
            );

            -- 4. 员工-站点动态归属与借调关系表
            CREATE TABLE IF NOT EXISTS employee_station_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                emp_id INTEGER NOT NULL REFERENCES employees(id),
                station_id INTEGER NOT NULL REFERENCES stations(id),
                assignment_type TEXT NOT NULL DEFAULT 'PRIMARY', -- 'PRIMARY' | 'LOAN'
                effective_from TEXT NOT NULL,
                effective_to TEXT DEFAULT NULL,
                status TEXT NOT NULL DEFAULT 'ACTIVE'
            );

            -- 5. 工艺工序字典表 (可配置工艺)
            CREATE TABLE IF NOT EXISTS processes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workshop_id INTEGER NOT NULL REFERENCES workshops(id),
                recommended_station_id INTEGER REFERENCES stations(id),
                process_code TEXT NOT NULL UNIQUE,
                process_name TEXT NOT NULL,
                product_spec TEXT NOT NULL,
                category TEXT NOT NULL,
                unit_price REAL NOT NULL,
                unit TEXT NOT NULL DEFAULT '件',
                remarks TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'ACTIVE'
            );

            -- 6. 工艺工价版本历史表 (每个工艺计件金额可配置、带版本防篡改)
            CREATE TABLE IF NOT EXISTS process_price_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                process_id INTEGER NOT NULL REFERENCES processes(id),
                version_tag TEXT NOT NULL,
                unit_price REAL NOT NULL,
                scrap_rate_deduct REAL DEFAULT 1.0,
                effective_date TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            -- 7. 生产计件流水明细账 (锁定单价快照与发生站点)
            CREATE TABLE IF NOT EXISTS work_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_date TEXT NOT NULL,
                batch_no TEXT NOT NULL,
                station_id INTEGER NOT NULL REFERENCES stations(id),
                emp_id INTEGER NOT NULL REFERENCES employees(id),
                process_id INTEGER NOT NULL REFERENCES processes(id),
                quantity INTEGER NOT NULL,
                scrap_quantity INTEGER NOT NULL DEFAULT 0,
                unit_price REAL NOT NULL,
                total_amount REAL NOT NULL,
                settled INTEGER NOT NULL DEFAULT 0,
                settled_at TEXT DEFAULT NULL,
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_records_date ON work_records(record_date);
            CREATE INDEX IF NOT EXISTS idx_records_station ON work_records(station_id);
            CREATE INDEX IF NOT EXISTS idx_records_emp ON work_records(emp_id);
            CREATE INDEX IF NOT EXISTS idx_records_process ON work_records(process_id);
            CREATE INDEX IF NOT EXISTS idx_records_batch ON work_records(batch_no);

            -- 8. 产品规格型号字典表 (主数据)
            CREATE TABLE IF NOT EXISTS product_models (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_code TEXT NOT NULL UNIQUE,
                model_name TEXT NOT NULL,
                hole_count INTEGER DEFAULT 0,
                category TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'ACTIVE',
                remarks TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_product_models_code ON product_models(model_code);
            CREATE INDEX IF NOT EXISTS idx_product_models_status ON product_models(status);

            -- 9. 产品标准加工孔数配置表 (动态主数据)
            CREATE TABLE IF NOT EXISTS product_hole_specs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hole_count INTEGER NOT NULL UNIQUE,
                remarks TEXT DEFAULT '',
                sort_order INTEGER DEFAULT 0
            );

            -- 10. 一级部门组织表 (树形第一级)
            CREATE TABLE IF NOT EXISTS departments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dept_code TEXT NOT NULL UNIQUE,
                dept_name TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0
            );

            -- 11. 独立从属班组表 (横向协同编组，独立实体，不归入三级树)
            CREATE TABLE IF NOT EXISTS teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_code TEXT NOT NULL UNIQUE,
                team_name TEXT NOT NULL,
                leader_name TEXT DEFAULT '',
                remarks TEXT DEFAULT '',
                sort_order INTEGER DEFAULT 0
            );
            ",
        )?;

        // 平滑数据库升级：字段缺失时自动安全打补丁
        let check_and_add_column = |table: &str, column: &str, col_def: &str| {
            let exists: bool = conn
                .prepare(&format!("PRAGMA table_info({})", table))
                .and_then(|mut stmt| {
                    let mut rows = stmt.query([])?;
                    let mut found = false;
                    while let Some(row) = rows.next()? {
                        let col_name: String = row.get(1)?;
                        if col_name == column {
                            found = true;
                            break;
                        }
                    }
                    Ok(found)
                })
                .unwrap_or(true);

            if !exists {
                let _ = conn.execute(&format!("ALTER TABLE {} ADD COLUMN {} {};", table, column, col_def), []);
            }
        };

        check_and_add_column("product_models", "hole_count", "INTEGER DEFAULT 0");
        check_and_add_column("workshops", "department_id", "INTEGER DEFAULT 1");
        check_and_add_column("employees", "team_id", "INTEGER DEFAULT NULL");
        check_and_add_column("work_records", "team_id", "INTEGER DEFAULT NULL");

        // 初始化一级部门预设数据 (三级树第一级)
        let dept_rows: i64 = conn.query_row("SELECT COUNT(*) FROM departments", [], |r| r.get(0)).unwrap_or(0);
        if dept_rows == 0 {
            let default_depts = [
                ("DEP-01", "生产制造部", 1),
                ("DEP-02", "质量保证部", 2),
                ("DEP-03", "工艺工程部", 3),
            ];
            for (code, name, sort) in default_depts {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO departments (dept_code, dept_name, sort_order) VALUES (?1, ?2, ?3)",
                    params![code, name, sort],
                );
            }
        }

        // 初始化独立班组预设数据 (独立实体)
        let team_rows: i64 = conn.query_row("SELECT COUNT(*) FROM teams", [], |r| r.get(0)).unwrap_or(0);
        if team_rows == 0 {
            let default_teams = [
                ("TM-01", "碳纤铺叠一班", "张建国", "负责前段模具布料预型与手工精密铺叠", 1),
                ("TM-02", "碳纤铺叠二班", "李红兵", "负责轻量化超薄轮圈定制铺叠", 2),
                ("TM-03", "轮圈热压成型组", "王大成", "负责真空袋压、高温模压与脱模", 3),
                ("TM-04", "数控钻孔打孔班", "赵明", "负责 16-36H 物理辐条孔精密数控加工", 4),
                ("TM-05", "碳纤编轮总装班", "孙立新", "负责碳条穿线、辐条张力校正与对锁总装", 5),
                ("TM-06", "成品动平衡质检组", "周华", "负责偏摆、圆跳动检测及成品包装出厂", 6),
            ];
            for (code, name, leader, remarks, sort) in default_teams {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO teams (team_code, team_name, leader_name, remarks, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![code, name, leader, remarks, sort],
                );
            }
        }

        // 自行车碳纤维轮圈内置物理打孔规格：16, 18, 20, 21, 24, 28, 32, 36
        // 彻底清理并删除除这 8 个规格外的所有其他历史孔数配置
        let bicycle_rim_specs = [16, 18, 20, 21, 24, 28, 32, 36];
        let _ = conn.execute(
            "DELETE FROM product_hole_specs WHERE hole_count NOT IN (16, 18, 20, 21, 24, 28, 32, 36);",
            [],
        );

        // 补全内置的自行车碳纤维轮圈标准打孔规格
        for (idx, &h) in bicycle_rim_specs.iter().enumerate() {
            let remarks = match h {
                16 => "16孔 破风前轮极简编法",
                18 => "18孔 竞赛轻量前轮",
                20 => "20孔 公路直拉常规前轮",
                21 => "21孔 2:1/G3 编法后轮",
                24 => "24孔 公路车/山地主流常规规格",
                28 => "28孔 越野/高强度碟刹规格",
                32 => "32孔 耐力/重载山地轮圈",
                36 => "36孔 旅行/高承重轮圈",
                _ => "自行车碳纤维轮圈标准物理打孔",
            };
            let _ = conn.execute(
                "INSERT OR IGNORE INTO product_hole_specs (hole_count, remarks, sort_order) VALUES (?1, ?2, ?3)",
                params![h, remarks, idx as i64],
            );
        }

        Ok(())
    }

    fn seed_carbon_fiber_factory_data(&self) -> std::result::Result<(), String> {
        // 全面清除所有演示数据播种。新系统创建或初始化时，保持纯净白纸状态，行数均为 0
        Ok(())
    }

    pub fn clear_all_data(&self) -> std::result::Result<(), String> {
        let mut conn = self.get_conn().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM work_records;", []).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM process_price_versions;", []).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM processes;", []).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM employee_station_assignments;", []).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM employees;", []).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM stations;", []).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM workshops;", []).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM product_models;", []).map_err(|e| e.to_string())?;
        let _ = tx.execute(
            "DELETE FROM sqlite_sequence WHERE name IN ('work_records', 'process_price_versions', 'processes', 'employee_station_assignments', 'employees', 'stations', 'workshops', 'product_models');",
            [],
        );
        tx.commit().map_err(|e| e.to_string())?;
        conn.execute("VACUUM;", []).map_err(|e| e.to_string())?;
        Ok(())
    }

    // --- 组织架构与独立班组管理 ---
    pub fn get_departments(&self) -> std::result::Result<Vec<Department>, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, dept_code, dept_name, sort_order FROM departments ORDER BY sort_order ASC, id ASC")
            .map_err(|e| e.to_string())?;

        let rows = stmt.query_map([], |r| {
            Ok(Department {
                id: Some(r.get(0)?),
                dept_code: r.get(1)?,
                dept_name: r.get(2)?,
                sort_order: r.get(3)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn save_department(&self, dept: Department) -> std::result::Result<Department, String> {
        let code = dept.dept_code.trim();
        let name = dept.dept_name.trim();
        if code.is_empty() || name.is_empty() {
            return Err("[CRITICAL] 部门代码与部门名称不能为空".to_string());
        }

        let conn = self.get_conn().map_err(|e| e.to_string())?;
        if let Some(id) = dept.id {
            conn.execute(
                "UPDATE departments SET dept_code = ?1, dept_name = ?2, sort_order = ?3 WHERE id = ?4",
                params![code, name, dept.sort_order, id],
            ).map_err(|e| format!("[CRITICAL] 更新部门失败: {}", e))?;
            Ok(dept)
        } else {
            conn.execute(
                "INSERT INTO departments (dept_code, dept_name, sort_order) VALUES (?1, ?2, ?3)",
                params![code, name, dept.sort_order],
            ).map_err(|e| format!("[CRITICAL] 新增部门失败 (代码可能重复): {}", e))?;
            let id = conn.last_insert_rowid();
            let mut res = dept;
            res.id = Some(id);
            Ok(res)
        }
    }

    pub fn delete_department(&self, id: i64) -> std::result::Result<(), String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let in_use: i64 = conn.query_row(
            "SELECT COUNT(*) FROM workshops WHERE department_id = ?1",
            params![id],
            |r| r.get(0),
        ).unwrap_or(0);

        if in_use > 0 {
            return Err(format!("[CRITICAL] 无法删除该部门：已有 {} 个车间工段隶属于该部门！", in_use));
        }

        conn.execute("DELETE FROM departments WHERE id = ?1", params![id])
            .map_err(|e| format!("[CRITICAL] 删除部门失败: {}", e))?;
        Ok(())
    }

    pub fn get_teams(&self) -> std::result::Result<Vec<Team>, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT t.id, t.team_code, t.team_name, t.leader_name, t.remarks, t.sort_order,
                 (SELECT COUNT(*) FROM employees e WHERE e.team_id = t.id AND e.status = 'ACTIVE') as member_count
                 FROM teams t
                 ORDER BY t.sort_order ASC, t.id ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt.query_map([], |r| {
            Ok(Team {
                id: Some(r.get(0)?),
                team_code: r.get(1)?,
                team_name: r.get(2)?,
                leader_name: r.get(3)?,
                remarks: r.get(4)?,
                sort_order: r.get(5)?,
                member_count: Some(r.get(6)?),
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn save_team(&self, team: Team) -> std::result::Result<Team, String> {
        let code = team.team_code.trim();
        let name = team.team_name.trim();
        if code.is_empty() || name.is_empty() {
            return Err("[CRITICAL] 班组代码与班组名称不能为空".to_string());
        }

        let conn = self.get_conn().map_err(|e| e.to_string())?;
        if let Some(id) = team.id {
            conn.execute(
                "UPDATE teams SET team_code = ?1, team_name = ?2, leader_name = ?3, remarks = ?4, sort_order = ?5 WHERE id = ?6",
                params![code, name, team.leader_name.trim(), team.remarks.trim(), team.sort_order, id],
            ).map_err(|e| format!("[CRITICAL] 更新班组失败: {}", e))?;
            Ok(team)
        } else {
            conn.execute(
                "INSERT INTO teams (team_code, team_name, leader_name, remarks, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![code, name, team.leader_name.trim(), team.remarks.trim(), team.sort_order],
            ).map_err(|e| format!("[CRITICAL] 新增班组失败 (班组代码可能重复): {}", e))?;
            let id = conn.last_insert_rowid();
            let mut res = team;
            res.id = Some(id);
            Ok(res)
        }
    }

    pub fn delete_team(&self, id: i64) -> std::result::Result<(), String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let in_use: i64 = conn.query_row(
            "SELECT COUNT(*) FROM employees WHERE team_id = ?1",
            params![id],
            |r| r.get(0),
        ).unwrap_or(0);

        if in_use > 0 {
            return Err(format!("[CRITICAL] 无法删除该班组：当前有 {} 名员工隶属于该班组！", in_use));
        }

        conn.execute("DELETE FROM teams WHERE id = ?1", params![id])
            .map_err(|e| format!("[CRITICAL] 删除班组失败: {}", e))?;
        Ok(())
    }

    // --- 工段与站点管理 ---
    pub fn get_workshops(&self) -> std::result::Result<Vec<Workshop>, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT w.id, w.department_id, d.dept_name, w.workshop_code, w.workshop_name, w.description, w.status 
             FROM workshops w 
             LEFT JOIN departments d ON w.department_id = d.id 
             ORDER BY w.id ASC"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map([], |r| {
            Ok(Workshop {
                id: Some(r.get(0)?),
                department_id: r.get(1)?,
                department_name: r.get(2)?,
                workshop_code: r.get(3)?,
                workshop_name: r.get(4)?,
                description: r.get(5)?,
                status: r.get(6)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_stations(&self, workshop_id_filter: Option<i64>) -> std::result::Result<Vec<Station>, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let sql = match workshop_id_filter {
            Some(_wid) => "
                SELECT 
                    s.id, s.workshop_id, w.department_id, d.dept_name, w.workshop_code, w.workshop_name,
                    s.station_code, s.station_name, s.supervisor, s.target_output_daily,
                    s.sort_order, s.status,
                    (SELECT COUNT(DISTINCT emp_id) FROM employee_station_assignments WHERE station_id = s.id AND status = 'ACTIVE') as staff_count
                FROM stations s
                JOIN workshops w ON s.workshop_id = w.id
                LEFT JOIN departments d ON w.department_id = d.id
                WHERE s.workshop_id = ?1
                ORDER BY s.sort_order ASC, s.id ASC",
            None => "
                SELECT 
                    s.id, s.workshop_id, w.department_id, d.dept_name, w.workshop_code, w.workshop_name,
                    s.station_code, s.station_name, s.supervisor, s.target_output_daily,
                    s.sort_order, s.status,
                    (SELECT COUNT(DISTINCT emp_id) FROM employee_station_assignments WHERE station_id = s.id AND status = 'ACTIVE') as staff_count
                FROM stations s
                JOIN workshops w ON s.workshop_id = w.id
                LEFT JOIN departments d ON w.department_id = d.id
                ORDER BY s.sort_order ASC, s.id ASC",
        };

        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let map_fn = |r: &rusqlite::Row| {
            Ok(Station {
                id: Some(r.get(0)?),
                workshop_id: r.get(1)?,
                department_id: r.get(2)?,
                department_name: r.get(3)?,
                workshop_code: Some(r.get(4)?),
                workshop_name: Some(r.get(5)?),
                station_code: r.get(6)?,
                station_name: r.get(7)?,
                supervisor: r.get(8)?,
                target_output_daily: r.get(9)?,
                sort_order: r.get(10)?,
                status: r.get(11)?,
                active_staff_count: Some(r.get(12)?),
            })
        };

        let rows = if let Some(wid) = workshop_id_filter {
            stmt.query_map(params![wid], map_fn)
        } else {
            stmt.query_map([], map_fn)
        }.map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn save_station(&self, station: Station) -> std::result::Result<Station, String> {
        let code = station.station_code.trim();
        let name = station.station_name.trim();
        if code.is_empty() || name.is_empty() {
            return Err("[CRITICAL] 站点编号与站点名称不能为空".to_string());
        }

        let conn = self.get_conn().map_err(|e| e.to_string())?;
        if let Some(id) = station.id {
            conn.execute(
                "UPDATE stations SET workshop_id = ?1, station_code = ?2, station_name = ?3, supervisor = ?4, target_output_daily = ?5, sort_order = ?6, status = ?7 WHERE id = ?8",
                params![station.workshop_id, code, name, station.supervisor.trim(), station.target_output_daily, station.sort_order, station.status, id],
            ).map_err(|e| format!("[CRITICAL] 更新站点失败: {}", e))?;
            Ok(station)
        } else {
            conn.execute(
                "INSERT INTO stations (workshop_id, station_code, station_name, supervisor, target_output_daily, sort_order, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![station.workshop_id, code, name, station.supervisor.trim(), station.target_output_daily, station.sort_order, station.status],
            ).map_err(|e| format!("[CRITICAL] 新增站点失败 (站点代码可能重复): {}", e))?;
            let id = conn.last_insert_rowid();
            let mut res = station;
            res.id = Some(id);
            Ok(res)
        }
    }

    // --- 员工与站点分配管理 ---
    pub fn get_employees(&self, status_filter: Option<String>) -> std::result::Result<Vec<Employee>, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let sql = match status_filter.as_deref() {
            Some("ACTIVE") => "
                SELECT e.id, e.emp_code, e.name, e.department, d.dept_name,
                       e.team_id, t.team_name,
                       e.primary_station_id, s.station_name, w.workshop_name, e.skill_level, e.phone, e.status, e.created_at
                FROM employees e
                LEFT JOIN stations s ON e.primary_station_id = s.id
                LEFT JOIN workshops w ON s.workshop_id = w.id
                LEFT JOIN departments d ON w.department_id = d.id
                LEFT JOIN teams t ON e.team_id = t.id
                WHERE e.status = 'ACTIVE' ORDER BY e.emp_code ASC",
            Some("INACTIVE") => "
                SELECT e.id, e.emp_code, e.name, e.department, d.dept_name,
                       e.team_id, t.team_name,
                       e.primary_station_id, s.station_name, w.workshop_name, e.skill_level, e.phone, e.status, e.created_at
                FROM employees e
                LEFT JOIN stations s ON e.primary_station_id = s.id
                LEFT JOIN workshops w ON s.workshop_id = w.id
                LEFT JOIN departments d ON w.department_id = d.id
                LEFT JOIN teams t ON e.team_id = t.id
                WHERE e.status = 'INACTIVE' ORDER BY e.emp_code ASC",
            _ => "
                SELECT e.id, e.emp_code, e.name, e.department, d.dept_name,
                       e.team_id, t.team_name,
                       e.primary_station_id, s.station_name, w.workshop_name, e.skill_level, e.phone, e.status, e.created_at
                FROM employees e
                LEFT JOIN stations s ON e.primary_station_id = s.id
                LEFT JOIN workshops w ON s.workshop_id = w.id
                LEFT JOIN departments d ON w.department_id = d.id
                LEFT JOIN teams t ON e.team_id = t.id
                ORDER BY e.emp_code ASC",
        };

        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok(Employee {
                id: Some(row.get(0)?),
                emp_code: row.get(1)?,
                name: row.get(2)?,
                department: row.get(3)?,
                department_name: row.get(4)?,
                team_id: row.get(5)?,
                team_name: row.get(6)?,
                primary_station_id: row.get(7)?,
                primary_station_name: row.get(8)?,
                workshop_name: row.get(9)?,
                skill_level: row.get(10)?,
                phone: row.get(11)?,
                status: row.get(12)?,
                created_at: Some(row.get(13)?),
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn add_employee(&self, emp: Employee) -> std::result::Result<Employee, String> {
        let code = emp.emp_code.trim();
        let name = emp.name.trim();
        if code.is_empty() || name.is_empty() {
            return Err("[CRITICAL] 工号与姓名不能为空".to_string());
        }

        let mut conn = self.get_conn().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let today = Local::now().format("%Y-%m-%d").to_string();

        tx.execute(
            "INSERT INTO employees (emp_code, name, department, team_id, primary_station_id, skill_level, phone, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![code, name, emp.department.trim(), emp.team_id, emp.primary_station_id, emp.skill_level, emp.phone.trim(), emp.status, now],
        ).map_err(|e| format!("[CRITICAL] 登记员工失败 (工号可能重复): {}", e))?;

        let last_id = tx.last_insert_rowid();

        // 如果指定了主站点，自动建立主站点归属映射
        if let Some(sid) = emp.primary_station_id {
            tx.execute(
                "INSERT INTO employee_station_assignments (emp_id, station_id, assignment_type, effective_from, status) VALUES (?1, ?2, 'PRIMARY', ?3, 'ACTIVE')",
                params![last_id, sid, today],
            ).map_err(|e| e.to_string())?;
        }

        tx.commit().map_err(|e| e.to_string())?;

        Ok(Employee {
            id: Some(last_id),
            emp_code: code.to_string(),
            name: name.to_string(),
            department: emp.department,
            department_name: None,
            team_id: emp.team_id,
            team_name: None,
            primary_station_id: emp.primary_station_id,
            primary_station_name: None,
            workshop_name: None,
            skill_level: emp.skill_level,
            phone: emp.phone,
            status: emp.status,
            created_at: Some(now),
        })
    }

    pub fn update_employee(&self, emp: Employee) -> std::result::Result<(), String> {
        let id = emp.id.ok_or_else(|| "[CRITICAL] 缺少员工唯一标识 ID".to_string())?;
        let code = emp.emp_code.trim();
        let name = emp.name.trim();
        if code.is_empty() || name.is_empty() {
            return Err("[CRITICAL] 工号与姓名不能为空".to_string());
        }

        let mut conn = self.get_conn().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let today = Local::now().format("%Y-%m-%d").to_string();

        tx.execute(
            "UPDATE employees SET emp_code = ?1, name = ?2, department = ?3, team_id = ?4, primary_station_id = ?5, skill_level = ?6, phone = ?7, status = ?8 WHERE id = ?9",
            params![code, name, emp.department.trim(), emp.team_id, emp.primary_station_id, emp.skill_level, emp.phone.trim(), emp.status, id],
        ).map_err(|e| format!("[CRITICAL] 更新员工失败: {}", e))?;

        if let Some(sid) = emp.primary_station_id {
            // 同步或插入主站点归属
            let count: i64 = tx.query_row(
                "SELECT COUNT(*) FROM employee_station_assignments WHERE emp_id = ?1 AND assignment_type = 'PRIMARY'",
                params![id],
                |r| r.get(0),
            ).unwrap_or(0);

            if count > 0 {
                tx.execute(
                    "UPDATE employee_station_assignments SET station_id = ?1 WHERE emp_id = ?2 AND assignment_type = 'PRIMARY'",
                    params![sid, id],
                ).map_err(|e| e.to_string())?;
            } else {
                tx.execute(
                    "INSERT INTO employee_station_assignments (emp_id, station_id, assignment_type, effective_from, status) VALUES (?1, ?2, 'PRIMARY', ?3, 'ACTIVE')",
                    params![id, sid, today],
                ).map_err(|e| e.to_string())?;
            }
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_employee(&self, id: i64) -> std::result::Result<(), String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM work_records WHERE emp_id = ?1", params![id], |r| r.get(0))
            .unwrap_or(0);

        if count > 0 {
            conn.execute("UPDATE employees SET status = 'INACTIVE' WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
            return Ok(());
        }

        conn.execute("DELETE FROM employee_station_assignments WHERE emp_id = ?1", params![id]).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM employees WHERE id = ?1", params![id])
            .map_err(|e| format!("[CRITICAL] 删除员工记录失败: {}", e))?;
        Ok(())
    }

    pub fn assign_employee_station(
        &self,
        emp_id: i64,
        station_id: i64,
        assignment_type: String, // "PRIMARY" | "LOAN"
        effective_from: String,
        effective_to: Option<String>,
    ) -> std::result::Result<(), String> {
        let mut conn = self.get_conn().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        if assignment_type == "PRIMARY" {
            // 更新员工表的主站点引用
            tx.execute(
                "UPDATE employees SET primary_station_id = ?1 WHERE id = ?2",
                params![station_id, emp_id],
            ).map_err(|e| e.to_string())?;

            tx.execute(
                "DELETE FROM employee_station_assignments WHERE emp_id = ?1 AND assignment_type = 'PRIMARY'",
                params![emp_id],
            ).map_err(|e| e.to_string())?;
        }

        tx.execute(
            "INSERT INTO employee_station_assignments (emp_id, station_id, assignment_type, effective_from, effective_to, status) VALUES (?1, ?2, ?3, ?4, ?5, 'ACTIVE')",
            params![emp_id, station_id, assignment_type, effective_from.trim(), effective_to],
        ).map_err(|e| format!("[CRITICAL] 分配员工归属站点失败: {}", e))?;

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_station_employees(&self, station_id: i64) -> std::result::Result<Vec<EmployeeStationAssignment>, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT a.id, a.emp_id, e.emp_code, e.name, a.station_id, s.station_code, s.station_name, w.workshop_name, a.assignment_type, a.effective_from, a.effective_to, a.status
             FROM employee_station_assignments a
             JOIN employees e ON a.emp_id = e.id
             JOIN stations s ON a.station_id = s.id
             JOIN workshops w ON s.workshop_id = w.id
             WHERE a.station_id = ?1 AND a.status = 'ACTIVE'
             ORDER BY a.assignment_type DESC, e.emp_code ASC"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map(params![station_id], |r| {
            Ok(EmployeeStationAssignment {
                id: Some(r.get(0)?),
                emp_id: r.get(1)?,
                emp_code: Some(r.get(2)?),
                emp_name: Some(r.get(3)?),
                station_id: r.get(4)?,
                station_code: Some(r.get(5)?),
                station_name: Some(r.get(6)?),
                workshop_name: Some(r.get(7)?),
                assignment_type: r.get(8)?,
                effective_from: r.get(9)?,
                effective_to: r.get(10)?,
                status: r.get(11)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    // --- 工艺工序与工价版本管理 ---
    pub fn get_processes(&self, station_id_filter: Option<i64>) -> std::result::Result<Vec<ProcessItem>, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let sql = match station_id_filter {
            Some(_sid) => "
                SELECT 
                    p.id, p.workshop_id, w.workshop_code, w.workshop_name,
                    p.recommended_station_id, s.station_code, s.station_name,
                    p.process_code, p.process_name, p.product_spec, p.category,
                    p.unit_price, p.unit, p.remarks, p.status,
                    (SELECT version_tag FROM process_price_versions WHERE process_id = p.id ORDER BY id DESC LIMIT 1) as v_tag
                FROM processes p
                JOIN workshops w ON p.workshop_id = w.id
                LEFT JOIN stations s ON p.recommended_station_id = s.id
                WHERE p.recommended_station_id = ?1
                ORDER BY p.process_code ASC",
            None => "
                SELECT 
                    p.id, p.workshop_id, w.workshop_code, w.workshop_name,
                    p.recommended_station_id, s.station_code, s.station_name,
                    p.process_code, p.process_name, p.product_spec, p.category,
                    p.unit_price, p.unit, p.remarks, p.status,
                    (SELECT version_tag FROM process_price_versions WHERE process_id = p.id ORDER BY id DESC LIMIT 1) as v_tag
                FROM processes p
                JOIN workshops w ON p.workshop_id = w.id
                LEFT JOIN stations s ON p.recommended_station_id = s.id
                ORDER BY p.process_code ASC",
        };

        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let map_fn = |row: &rusqlite::Row| {
            Ok(ProcessItem {
                id: Some(row.get(0)?),
                workshop_id: row.get(1)?,
                workshop_code: Some(row.get(2)?),
                workshop_name: Some(row.get(3)?),
                recommended_station_id: row.get(4)?,
                station_code: row.get(5)?,
                station_name: row.get(6)?,
                process_code: row.get(7)?,
                process_name: row.get(8)?,
                product_spec: row.get(9)?,
                category: row.get(10)?,
                unit_price: row.get(11)?,
                unit: row.get(12)?,
                remarks: row.get(13)?,
                status: row.get(14)?,
                price_version_tag: row.get(15)?,
            })
        };

        let rows = if let Some(sid) = station_id_filter {
            stmt.query_map(params![sid], map_fn)
        } else {
            stmt.query_map([], map_fn)
        }.map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn save_process_with_pricing(&self, proc: ProcessItem, version_tag: String) -> std::result::Result<ProcessItem, String> {
        let code = proc.process_code.trim();
        let name = proc.process_name.trim();
        if code.is_empty() || name.is_empty() {
            return Err("[CRITICAL] 工艺代码与工艺名称不能为空".to_string());
        }
        if proc.unit_price < 0.0 {
            return Err("[CRITICAL] 计件单价不能为负数".to_string());
        }

        let mut conn = self.get_conn().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let today = Local::now().format("%Y-%m-%d").to_string();

        let process_id = if let Some(id) = proc.id {
            tx.execute(
                "UPDATE processes SET workshop_id = ?1, recommended_station_id = ?2, process_code = ?3, process_name = ?4, product_spec = ?5, category = ?6, unit_price = ?7, unit = ?8, remarks = ?9, status = ?10 WHERE id = ?11",
                params![proc.workshop_id, proc.recommended_station_id, code, name, proc.product_spec.trim(), proc.category.trim(), proc.unit_price, proc.unit.trim(), proc.remarks.trim(), proc.status, id],
            ).map_err(|e| format!("[CRITICAL] 更新工艺失败: {}", e))?;
            id
        } else {
            tx.execute(
                "INSERT INTO processes (workshop_id, recommended_station_id, process_code, process_name, product_spec, category, unit_price, unit, remarks, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![proc.workshop_id, proc.recommended_station_id, code, name, proc.product_spec.trim(), proc.category.trim(), proc.unit_price, proc.unit.trim(), proc.remarks.trim(), proc.status],
            ).map_err(|e| format!("[CRITICAL] 新增工艺失败 (工艺代码可能重复): {}", e))?;
            tx.last_insert_rowid()
        };

        // 插入工价历史版本
        let tag = if version_tag.trim().is_empty() { format!("工价版本-{}", today) } else { version_tag.trim().to_string() };
        tx.execute(
            "INSERT INTO process_price_versions (process_id, version_tag, unit_price, scrap_rate_deduct, effective_date, created_at) VALUES (?1, ?2, ?3, 1.0, ?4, ?5)",
            params![process_id, tag, proc.unit_price, today, now],
        ).map_err(|e| e.to_string())?;

        tx.commit().map_err(|e| e.to_string())?;

        let mut res = proc;
        res.id = Some(process_id);
        res.price_version_tag = Some(tag);
        Ok(res)
    }

    pub fn get_process_price_history(&self, process_id: i64) -> std::result::Result<Vec<ProcessPriceVersion>, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, process_id, version_tag, unit_price, scrap_rate_deduct, effective_date, created_at
             FROM process_price_versions
             WHERE process_id = ?1
             ORDER BY effective_date DESC, id DESC"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map(params![process_id], |r| {
            Ok(ProcessPriceVersion {
                id: Some(r.get(0)?),
                process_id: r.get(1)?,
                version_tag: r.get(2)?,
                unit_price: r.get(3)?,
                scrap_rate_deduct: r.get(4)?,
                effective_date: r.get(5)?,
                created_at: Some(r.get(6)?),
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn delete_process(&self, id: i64) -> std::result::Result<(), String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM work_records WHERE process_id = ?1", params![id], |r| r.get(0))
            .unwrap_or(0);

        if count > 0 {
            conn.execute("UPDATE processes SET status = 'INACTIVE' WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
            return Ok(());
        }

        conn.execute("DELETE FROM process_price_versions WHERE process_id = ?1", params![id]).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM processes WHERE id = ?1", params![id])
            .map_err(|e| format!("[CRITICAL] 删除工艺失败: {}", e))?;
        Ok(())
    }

    // --- 计件报工记录流 (含站点与单价快照) ---
    pub fn get_records(
        &self,
        start_date: Option<String>,
        end_date: Option<String>,
        station_id: Option<i64>,
        emp_id: Option<i64>,
        process_id: Option<i64>,
        batch_no: Option<String>,
    ) -> std::result::Result<Vec<WorkRecord>, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;

        let mut conditions = Vec::new();
        let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

        if let Some(s) = start_date {
            if !s.is_empty() {
                conditions.push("w.record_date >= ?".to_string());
                params_vec.push(rusqlite::types::Value::Text(s));
            }
        }
        if let Some(e) = end_date {
            if !e.is_empty() {
                conditions.push("w.record_date <= ?".to_string());
                params_vec.push(rusqlite::types::Value::Text(e));
            }
        }
        if let Some(sid) = station_id {
            if sid > 0 {
                conditions.push("w.station_id = ?".to_string());
                params_vec.push(rusqlite::types::Value::Integer(sid));
            }
        }
        if let Some(eid) = emp_id {
            if eid > 0 {
                conditions.push("w.emp_id = ?".to_string());
                params_vec.push(rusqlite::types::Value::Integer(eid));
            }
        }
        if let Some(pid) = process_id {
            if pid > 0 {
                conditions.push("w.process_id = ?".to_string());
                params_vec.push(rusqlite::types::Value::Integer(pid));
            }
        }
        if let Some(b) = batch_no {
            if !b.trim().is_empty() {
                conditions.push("w.batch_no LIKE ?".to_string());
                params_vec.push(rusqlite::types::Value::Text(format!("%{}%", b.trim())));
            }
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let sql = format!(
            "SELECT 
                w.id, w.record_date, w.batch_no, w.station_id, s.station_code, s.station_name, ws.workshop_name,
                w.emp_id, e.emp_code, e.name, e.department,
                w.process_id, p.process_code, p.process_name, p.product_spec, p.category,
                w.quantity, w.scrap_quantity, w.unit_price, w.total_amount,
                w.settled, w.settled_at, w.team_id, tm.team_name, w.notes, w.created_at
            FROM work_records w
            JOIN stations s ON w.station_id = s.id
            JOIN workshops ws ON s.workshop_id = ws.id
            JOIN employees e ON w.emp_id = e.id
            LEFT JOIN teams tm ON w.team_id = tm.id
            JOIN processes p ON w.process_id = p.id
            {}
            ORDER BY w.record_date DESC, w.id DESC
            LIMIT 500",
            where_clause
        );

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params_vec), |row| {
            Ok(WorkRecord {
                id: Some(row.get(0)?),
                record_date: row.get(1)?,
                batch_no: row.get(2)?,
                station_id: row.get(3)?,
                station_code: Some(row.get(4)?),
                station_name: Some(row.get(5)?),
                workshop_name: Some(row.get(6)?),
                emp_id: row.get(7)?,
                emp_code: Some(row.get(8)?),
                emp_name: Some(row.get(9)?),
                department: Some(row.get(10)?),
                process_id: row.get(11)?,
                process_code: Some(row.get(12)?),
                process_name: Some(row.get(13)?),
                product_spec: Some(row.get(14)?),
                category: Some(row.get(15)?),
                quantity: row.get(16)?,
                scrap_quantity: row.get(17)?,
                unit_price: row.get(18)?,
                total_amount: row.get(19)?,
                settled: row.get(20)?,
                settled_at: row.get(21)?,
                team_id: row.get(22)?,
                team_name: row.get(23)?,
                notes: row.get(24)?,
                created_at: Some(row.get(25)?),
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn add_record(&self, input: NewRecordInput) -> std::result::Result<WorkRecord, String> {
        if input.quantity <= 0 {
            return Err("[CRITICAL] 合格数量必须大于 0".to_string());
        }
        if input.unit_price < 0.0 {
            return Err("[CRITICAL] 单价不能为负数".to_string());
        }

        let mut conn = self.get_conn().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // 校验站点
        let (st_code, st_name, ws_name): (String, String, String) = tx.query_row(
            "SELECT s.station_code, s.station_name, w.workshop_name 
             FROM stations s JOIN workshops w ON s.workshop_id = w.id WHERE s.id = ?1",
            params![input.station_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).map_err(|_| format!("[CRITICAL] 未找到 ID 为 {} 的生产站点", input.station_id))?;

        // 校验员工与归属班组
        let (emp_code, emp_name, dept, emp_team_id, emp_team_name): (String, String, String, Option<i64>, Option<String>) = tx.query_row(
            "SELECT e.emp_code, e.name, e.department, e.team_id, t.team_name 
             FROM employees e 
             LEFT JOIN teams t ON e.team_id = t.id 
             WHERE e.id = ?1",
            params![input.emp_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        ).map_err(|_| format!("[CRITICAL] 未找到 ID 为 {} 的员工", input.emp_id))?;

        // 校验工艺
        let (proc_code, proc_name, spec, cat): (String, String, String, String) = tx.query_row(
            "SELECT process_code, process_name, product_spec, category FROM processes WHERE id = ?1",
            params![input.process_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        ).map_err(|_| format!("[CRITICAL] 未找到 ID 为 {} 的工艺", input.process_id))?;

        let total_amount = (input.quantity as f64) * input.unit_price;
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        tx.execute(
            "INSERT INTO work_records (record_date, batch_no, station_id, emp_id, team_id, process_id, quantity, scrap_quantity, unit_price, total_amount, settled, notes, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?12)",
            params![
                input.record_date.trim(),
                input.batch_no.trim(),
                input.station_id,
                input.emp_id,
                emp_team_id,
                input.process_id,
                input.quantity,
                input.scrap_quantity,
                input.unit_price, // 锁定单价物理快照
                total_amount,
                input.notes.trim(),
                now
            ],
        ).map_err(|e| format!("[CRITICAL] 写入计件流水失败: {}", e))?;

        let record_id = tx.last_insert_rowid();
        tx.commit().map_err(|e| e.to_string())?;

        Ok(WorkRecord {
            id: Some(record_id),
            record_date: input.record_date,
            batch_no: input.batch_no,
            station_id: input.station_id,
            station_code: Some(st_code),
            station_name: Some(st_name),
            workshop_name: Some(ws_name),
            emp_id: input.emp_id,
            emp_code: Some(emp_code),
            emp_name: Some(emp_name),
            department: Some(dept),
            process_id: input.process_id,
            process_code: Some(proc_code),
            process_name: Some(proc_name),
            product_spec: Some(spec),
            category: Some(cat),
            quantity: input.quantity,
            scrap_quantity: input.scrap_quantity,
            unit_price: input.unit_price,
            total_amount,
            settled: 0,
            settled_at: None,
            team_id: emp_team_id,
            team_name: emp_team_name,
            notes: input.notes,
            created_at: Some(now),
        })
    }

    pub fn add_team_batch_record(&self, input: TeamBatchRecordInput) -> std::result::Result<Vec<WorkRecord>, String> {
        if input.total_quantity <= 0 {
            return Err("[CRITICAL] 班组完工合格总数必须大于 0".to_string());
        }
        if input.unit_price < 0.0 {
            return Err("[CRITICAL] 单价不能为负数".to_string());
        }

        let mut conn = self.get_conn().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // 校验班组存在性
        let (_team_code, team_name): (String, String) = tx.query_row(
            "SELECT team_code, team_name FROM teams WHERE id = ?1",
            params![input.team_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).map_err(|_| format!("[CRITICAL] 未找到 ID 为 {} 的班组", input.team_id))?;

        // 查询该班组的所有在职员工
        struct TeamMember {
            id: i64,
            emp_code: String,
            name: String,
            department: String,
        }
        let members: Vec<TeamMember> = {
            let mut member_stmt = tx.prepare(
                "SELECT id, emp_code, name, department FROM employees WHERE team_id = ?1 AND status = 'ACTIVE' ORDER BY emp_code ASC"
            ).map_err(|e| e.to_string())?;

            let member_rows = member_stmt.query_map(params![input.team_id], |r| {
                Ok(TeamMember {
                    id: r.get(0)?,
                    emp_code: r.get(1)?,
                    name: r.get(2)?,
                    department: r.get(3)?,
                })
            }).map_err(|e| e.to_string())?;

            let mut list = Vec::new();
            for m in member_rows {
                list.push(m.map_err(|e| e.to_string())?);
            }
            list
        };

        if members.is_empty() {
            return Err(format!("[CRITICAL] 班组【{}】当前没有任何在职员工，无法进行集体计件核算！请先在员工档案中为该班组分配人员。", team_name));
        }

        // 校验生产站点
        let (st_code, st_name, ws_name): (String, String, String) = tx.query_row(
            "SELECT s.station_code, s.station_name, w.workshop_name 
             FROM stations s JOIN workshops w ON s.workshop_id = w.id WHERE s.id = ?1",
            params![input.station_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).map_err(|_| format!("[CRITICAL] 未找到 ID 为 {} 的生产站点", input.station_id))?;

        // 校验工艺
        let (proc_code, proc_name, spec, cat): (String, String, String, String) = tx.query_row(
            "SELECT process_code, process_name, product_spec, category FROM processes WHERE id = ?1",
            params![input.process_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        ).map_err(|_| format!("[CRITICAL] 未找到 ID 为 {} 的工艺", input.process_id))?;

        let member_count = members.len() as i64;
        let base_qty = input.total_quantity / member_count;
        let rem_qty = input.total_quantity % member_count;
        let base_scrap = input.scrap_quantity / member_count;
        let rem_scrap = input.scrap_quantity % member_count;
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        let mut created_records = Vec::new();

        for (idx, emp) in members.iter().enumerate() {
            let emp_qty = base_qty + if (idx as i64) < rem_qty { 1 } else { 0 };
            let emp_scrap = base_scrap + if (idx as i64) < rem_scrap { 1 } else { 0 };
            let emp_amount = (emp_qty as f64) * input.unit_price;
            let note_text = if input.notes.trim().is_empty() {
                format!("[班组集体记工: {} | 全班{}人平分]", team_name, member_count)
            } else {
                format!("[班组集体记工: {}] {}", team_name, input.notes.trim())
            };

            tx.execute(
                "INSERT INTO work_records (record_date, batch_no, station_id, emp_id, team_id, process_id, quantity, scrap_quantity, unit_price, total_amount, settled, notes, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?12)",
                params![
                    input.record_date.trim(),
                    input.batch_no.trim(),
                    input.station_id,
                    emp.id,
                    input.team_id,
                    input.process_id,
                    emp_qty,
                    emp_scrap,
                    input.unit_price,
                    emp_amount,
                    note_text.clone(),
                    now.clone(),
                ],
            ).map_err(|e| format!("[CRITICAL] 班组集体写入计件流水失败: {}", e))?;

            let rec_id = tx.last_insert_rowid();
            created_records.push(WorkRecord {
                id: Some(rec_id),
                record_date: input.record_date.clone(),
                batch_no: input.batch_no.clone(),
                station_id: input.station_id,
                station_code: Some(st_code.clone()),
                station_name: Some(st_name.clone()),
                workshop_name: Some(ws_name.clone()),
                emp_id: emp.id,
                emp_code: Some(emp.emp_code.clone()),
                emp_name: Some(emp.name.clone()),
                department: Some(emp.department.clone()),
                process_id: input.process_id,
                process_code: Some(proc_code.clone()),
                process_name: Some(proc_name.clone()),
                product_spec: Some(spec.clone()),
                category: Some(cat.clone()),
                quantity: emp_qty,
                scrap_quantity: emp_scrap,
                unit_price: input.unit_price,
                total_amount: emp_amount,
                settled: 0,
                settled_at: None,
                team_id: Some(input.team_id),
                team_name: Some(team_name.clone()),
                notes: note_text,
                created_at: Some(now.clone()),
            });
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(created_records)
    }

    pub fn delete_record(&self, id: i64) -> std::result::Result<(), String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let settled: i64 = conn.query_row(
            "SELECT settled FROM work_records WHERE id = ?1",
            params![id],
            |r| r.get(0),
        ).map_err(|_| format!("[CRITICAL] 记录不存在 (ID: {})", id))?;

        if settled == 1 {
            return Err("[CRITICAL] 已核算锁定的计件流水禁止删除，如需修改请先在核算台反结算".to_string());
        }

        conn.execute("DELETE FROM work_records WHERE id = ?1", params![id])
            .map_err(|e| format!("[CRITICAL] 删除记录失败: {}", e))?;
        Ok(())
    }

    pub fn settle_records(&self, ids: Vec<i64>, target_status: i64) -> std::result::Result<usize, String> {
        if ids.is_empty() {
            return Ok(0);
        }
        let mut conn = self.get_conn().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let settled_at = if target_status == 1 { Some(now) } else { None };

        let mut count = 0;
        for id in ids {
            let res = tx.execute(
                "UPDATE work_records SET settled = ?1, settled_at = ?2 WHERE id = ?3",
                params![target_status, settled_at, id],
            ).map_err(|e| format!("[CRITICAL] 更新结算状态失败: {}", e))?;
            count += res;
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(count)
    }

    // --- 统计与汇总报表 (支持站点、工段与员工多维对账) ---
    pub fn get_payroll_summary(
        &self,
        start_date: Option<String>,
        end_date: Option<String>,
        station_id: Option<i64>,
    ) -> std::result::Result<Vec<PayrollSummary>, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;

        let mut conditions = Vec::new();
        let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

        if let Some(s) = start_date {
            if !s.is_empty() {
                conditions.push("w.record_date >= ?".to_string());
                params_vec.push(rusqlite::types::Value::Text(s));
            }
        }
        if let Some(e) = end_date {
            if !e.is_empty() {
                conditions.push("w.record_date <= ?".to_string());
                params_vec.push(rusqlite::types::Value::Text(e));
            }
        }
        if let Some(sid) = station_id {
            if sid > 0 {
                conditions.push("w.station_id = ?".to_string());
                params_vec.push(rusqlite::types::Value::Integer(sid));
            }
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let and_clause = if where_clause.is_empty() {
            String::new()
        } else {
            format!("AND {}", &where_clause[6..])
        };

        let sql = format!(
            "SELECT 
                e.id, e.emp_code, e.name, e.department, s.station_name,
                COUNT(w.id) as total_records,
                COALESCE(SUM(w.quantity), 0) as total_pieces,
                COALESCE(SUM(w.scrap_quantity), 0) as total_scrap,
                COALESCE(SUM(w.total_amount), 0.0) as total_amount,
                COALESCE(SUM(CASE WHEN w.settled = 1 THEN 1 ELSE 0 END), 0) as settled_records,
                COALESCE(SUM(CASE WHEN w.settled = 0 THEN 1 ELSE 0 END), 0) as unsettled_records
            FROM employees e
            LEFT JOIN stations s ON e.primary_station_id = s.id
            LEFT JOIN work_records w ON e.id = w.emp_id {}
            WHERE e.status = 'ACTIVE' OR w.id IS NOT NULL
            GROUP BY e.id
            HAVING total_records > 0
            ORDER BY total_amount DESC",
            and_clause
        );

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params_vec), |row| {
            Ok(PayrollSummary {
                emp_id: row.get(0)?,
                emp_code: row.get(1)?,
                emp_name: row.get(2)?,
                department: row.get(3)?,
                primary_station_name: row.get(4)?,
                total_records: row.get(5)?,
                total_pieces: row.get(6)?,
                total_scrap: row.get(7)?,
                total_amount: row.get(8)?,
                settled_records: row.get(9)?,
                unsettled_records: row.get(10)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_station_summary(
        &self,
        start_date: Option<String>,
        end_date: Option<String>,
    ) -> std::result::Result<Vec<StationSummary>, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;

        let mut conditions = Vec::new();
        let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

        if let Some(s) = start_date {
            if !s.is_empty() {
                conditions.push("w.record_date >= ?".to_string());
                params_vec.push(rusqlite::types::Value::Text(s));
            }
        }
        if let Some(e) = end_date {
            if !e.is_empty() {
                conditions.push("w.record_date <= ?".to_string());
                params_vec.push(rusqlite::types::Value::Text(e));
            }
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let and_clause = if where_clause.is_empty() {
            String::new()
        } else {
            format!("AND {}", &where_clause[6..])
        };

        let sql = format!(
            "SELECT 
                s.id, s.station_code, s.station_name, ws.workshop_code, ws.workshop_name, s.supervisor,
                COALESCE(SUM(w.quantity), 0) as total_pieces,
                COALESCE(SUM(w.scrap_quantity), 0) as total_scrap,
                COALESCE(SUM(w.total_amount), 0.0) as total_amount,
                COUNT(w.id) as record_count
            FROM stations s
            JOIN workshops ws ON s.workshop_id = ws.id
            LEFT JOIN work_records w ON s.id = w.station_id {}
            GROUP BY s.id
            ORDER BY s.sort_order ASC",
            and_clause
        );

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params_vec), |row| {
            Ok(StationSummary {
                station_id: row.get(0)?,
                station_code: row.get(1)?,
                station_name: row.get(2)?,
                workshop_code: row.get(3)?,
                workshop_name: row.get(4)?,
                supervisor: row.get(5)?,
                total_pieces: row.get(6)?,
                total_scrap: row.get(7)?,
                total_amount: row.get(8)?,
                record_count: row.get(9)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_process_stats(
        &self,
        start_date: Option<String>,
        end_date: Option<String>,
        workshop_id: Option<i64>,
    ) -> std::result::Result<Vec<ProcessStats>, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;

        let mut conditions = Vec::new();
        let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

        if let Some(s) = start_date {
            if !s.is_empty() {
                conditions.push("w.record_date >= ?".to_string());
                params_vec.push(rusqlite::types::Value::Text(s));
            }
        }
        if let Some(e) = end_date {
            if !e.is_empty() {
                conditions.push("w.record_date <= ?".to_string());
                params_vec.push(rusqlite::types::Value::Text(e));
            }
        }
        if let Some(wid) = workshop_id {
            if wid > 0 {
                conditions.push("p.workshop_id = ?".to_string());
                params_vec.push(rusqlite::types::Value::Integer(wid));
            }
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let and_clause = if where_clause.is_empty() {
            String::new()
        } else {
            format!("AND {}", &where_clause[6..])
        };

        let sql = format!(
            "SELECT 
                p.id, p.process_code, p.process_name, p.product_spec, p.category, s.station_name, p.unit_price,
                COALESCE(SUM(w.quantity), 0) as total_quantity,
                COALESCE(SUM(w.scrap_quantity), 0) as total_scrap,
                COALESCE(SUM(w.total_amount), 0.0) as total_amount,
                COUNT(w.id) as record_count
            FROM processes p
            LEFT JOIN stations s ON p.recommended_station_id = s.id
            LEFT JOIN work_records w ON p.id = w.process_id {}
            GROUP BY p.id
            ORDER BY total_amount DESC",
            and_clause
        );

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params_vec), |row| {
            Ok(ProcessStats {
                process_id: row.get(0)?,
                process_code: row.get(1)?,
                process_name: row.get(2)?,
                product_spec: row.get(3)?,
                category: row.get(4)?,
                station_name: row.get(5)?,
                unit_price: row.get(6)?,
                total_quantity: row.get(7)?,
                total_scrap: row.get(8)?,
                total_amount: row.get(9)?,
                record_count: row.get(10)?,
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn get_system_stats(&self) -> std::result::Result<SystemStats, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let today = Local::now().format("%Y-%m-%d").to_string();

        let total_workshops: i64 = conn.query_row("SELECT COUNT(*) FROM workshops WHERE status = 'ACTIVE'", [], |r| r.get(0)).unwrap_or(0);
        let total_stations: i64 = conn.query_row("SELECT COUNT(*) FROM stations WHERE status = 'ACTIVE'", [], |r| r.get(0)).unwrap_or(0);
        let total_employees: i64 = conn.query_row("SELECT COUNT(*) FROM employees WHERE status = 'ACTIVE'", [], |r| r.get(0)).unwrap_or(0);
        let total_processes: i64 = conn.query_row("SELECT COUNT(*) FROM processes WHERE status = 'ACTIVE'", [], |r| r.get(0)).unwrap_or(0);
        let total_records: i64 = conn.query_row("SELECT COUNT(*) FROM work_records", [], |r| r.get(0)).unwrap_or(0);
        let total_wages: f64 = conn.query_row("SELECT COALESCE(SUM(total_amount), 0.0) FROM work_records", [], |r| r.get(0)).unwrap_or(0.0);

        let today_records: i64 = conn.query_row("SELECT COUNT(*) FROM work_records WHERE record_date = ?1", params![today], |r| r.get(0)).unwrap_or(0);
        let today_wages: f64 = conn.query_row("SELECT COALESCE(SUM(total_amount), 0.0) FROM work_records WHERE record_date = ?1", params![today], |r| r.get(0)).unwrap_or(0.0);

        let meta = fs::metadata(&self.db_path).ok();
        let db_size = meta.map(|m| m.len()).unwrap_or(0);

        Ok(SystemStats {
            total_workshops,
            total_stations,
            total_employees,
            total_processes,
            total_records,
            total_wages,
            today_records,
            today_wages,
            database_size_bytes: db_size,
            db_path: self.db_path.to_string_lossy().to_string(),
        })
    }

    pub fn backup_database(&self) -> std::result::Result<String, String> {
        let now_str = Local::now().format("%Y%m%d_%H%M%S").to_string();
        let backup_dir = Path::new("data/backups");
        if !backup_dir.exists() {
            let _ = fs::create_dir_all(backup_dir);
        }

        let target_filename = format!("piecework_backup_{}.db", now_str);
        let target_path = backup_dir.join(&target_filename);

        fs::copy(&self.db_path, &target_path)
            .map_err(|e| format!("[CRITICAL] 执行物理数据库备份失败: {}", e))?;

        Ok(target_filename)
    }

    pub fn list_backups(&self) -> std::result::Result<Vec<BackupInfo>, String> {
        let backup_dir = Path::new("data/backups");
        if !backup_dir.exists() {
            return Ok(Vec::new());
        }

        let mut list = Vec::new();
        if let Ok(entries) = fs::read_dir(backup_dir) {
            for entry in entries.flatten() {
                if let Ok(name) = entry.file_name().into_string() {
                    if name.ends_with(".db") {
                        let path = entry.path();
                        let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                        let created_at = fs::metadata(&path)
                            .and_then(|m| m.modified())
                            .map(|t| {
                                let dt: chrono::DateTime<Local> = t.into();
                                dt.format("%Y-%m-%d %H:%M:%S").to_string()
                            })
                            .unwrap_or_else(|_| "-".to_string());

                        list.push(BackupInfo {
                            filename: name,
                            file_size_bytes: size,
                            created_at,
                        });
                    }
                }
            }
        }
        list.sort_by(|a, b| b.filename.cmp(&a.filename));
        Ok(list)
    }

    pub fn restore_backup(&self, filename: &str) -> std::result::Result<(), String> {
        let backup_file = Path::new("data/backups").join(filename);
        if !backup_file.exists() {
            return Err(format!("[CRITICAL] 目标备份文件不存在: {}", filename));
        }

        // 还原前自动创建安全前置救援快照
        let safety_time = Local::now().format("%Y%m%d_%H%M%S").to_string();
        let safety_backup = Path::new("data/backups").join(format!("pre_restore_safety_{}.db", safety_time));
        let _ = fs::copy(&self.db_path, &safety_backup);

        // 物理覆盖数据库文件
        fs::copy(&backup_file, &self.db_path)
            .map_err(|e| format!("[CRITICAL] 还原数据库物理文件失败: {}", e))?;

        // 重新初始化并验证连接
        self.init_schema()
            .map_err(|e| format!("[CRITICAL] 还原后数据库架构校验失败: {}", e))?;

        Ok(())
    }

    pub fn delete_backup(&self, filename: &str) -> std::result::Result<(), String> {
        let backup_file = Path::new("data/backups").join(filename);
        if backup_file.exists() {
            fs::remove_file(&backup_file)
                .map_err(|e| format!("[CRITICAL] 删除备份文件失败: {}", e))?;
        }
        Ok(())
    }

    pub fn open_backup_folder(&self) -> std::result::Result<(), String> {
        let backup_dir = Path::new("data/backups");
        if !backup_dir.exists() {
            let _ = fs::create_dir_all(backup_dir);
        }
        let full_path = fs::canonicalize(backup_dir)
            .unwrap_or_else(|_| PathBuf::from("data\\backups"));

        std::process::Command::new("explorer")
            .arg(full_path.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("[CRITICAL] 打开备份文件夹失败: {}", e))?;
        Ok(())
    }

    // --- 产品规格型号管理 (主数据) ---
    pub fn get_product_models(&self) -> std::result::Result<Vec<ProductModel>, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, model_code, model_name, hole_count, category, status, remarks, created_at 
             FROM product_models 
             ORDER BY model_code ASC"
        ).map_err(|e| e.to_string())?;

        let rows = stmt.query_map([], |row| {
            Ok(ProductModel {
                id: Some(row.get(0)?),
                model_code: row.get(1)?,
                model_name: row.get(2)?,
                hole_count: row.get(3)?,
                category: row.get(4)?,
                status: row.get(5)?,
                remarks: row.get(6)?,
                created_at: Some(row.get(7)?),
            })
        }).map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn save_product_model(&self, model: ProductModel) -> std::result::Result<ProductModel, String> {
        let name = model.model_name.trim();
        if name.is_empty() {
            return Err("[CRITICAL] 产品规格型号名称不能为空".to_string());
        }

        // 自动编码：若未传入编码或为空，系统自动分配递增的唯一流水编码 (如 PM-001)
        let code = if model.model_code.trim().is_empty() {
            self.get_next_product_code()?
        } else {
            model.model_code.trim().to_string()
        };

        let hole_cnt = model.hole_count.unwrap_or(0);
        let category = model.category.as_deref().unwrap_or("").trim();
        let status = model.status.as_deref().unwrap_or("ACTIVE").trim();

        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        let model_id = if let Some(id) = model.id {
            conn.execute(
                "UPDATE product_models SET model_code = ?1, model_name = ?2, hole_count = ?3, category = ?4, status = ?5, remarks = ?6 WHERE id = ?7",
                params![code, name, hole_cnt, category, status, model.remarks.trim(), id],
            ).map_err(|e| format!("[CRITICAL] 更新产品型号失败 (型号编码可能重复): {}", e))?;
            id
        } else {
            conn.execute(
                "INSERT INTO product_models (model_code, model_name, hole_count, category, status, remarks, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![code, name, hole_cnt, category, status, model.remarks.trim(), now],
            ).map_err(|e| format!("[CRITICAL] 新增产品型号失败 (型号编码可能重复): {}", e))?;
            conn.last_insert_rowid()
        };

        let mut res = model;
        res.id = Some(model_id);
        res.model_code = code.to_string();
        res.hole_count = Some(hole_cnt);
        if res.created_at.is_none() {
            res.created_at = Some(now);
        }
        Ok(res)
    }

    pub fn delete_product_model(&self, id: i64) -> std::result::Result<(), String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        
        let model_code: String = conn.query_row(
            "SELECT model_code FROM product_models WHERE id = ?1",
            params![id],
            |r| r.get(0),
        ).map_err(|e| format!("[CRITICAL] 未找到指定型号 (ID: {}): {}", id, e))?;

        let ref_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM processes WHERE product_spec = ?1",
            params![model_code],
            |r| r.get(0),
        ).unwrap_or(0);

        if ref_count > 0 {
            return Err(format!(
                "[CRITICAL] 无法删除产品型号【{}】：该型号已被 {} 个工艺工序引用！请先解除关联或下架对应工艺。",
                model_code, ref_count
            ));
        }

        conn.execute("DELETE FROM product_models WHERE id = ?1", params![id])
            .map_err(|e| format!("[CRITICAL] 删除产品型号失败: {}", e))?;
        Ok(())
    }

    /// 获取系统自动生成的下一个可用产品型号编码 (如 PM-001, PM-002...)
    pub fn get_next_product_code(&self) -> std::result::Result<String, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT model_code FROM product_models WHERE model_code LIKE 'PM-%'")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;

        let mut max_seq: i64 = 0;
        for code_res in rows {
            if let Ok(code) = code_res {
                if let Some(num_str) = code.strip_prefix("PM-") {
                    if let Ok(num) = num_str.parse::<i64>() {
                        if num > max_seq {
                            max_seq = num;
                        }
                    }
                }
            }
        }

        if max_seq == 0 {
            let total: i64 = conn
                .query_row("SELECT COUNT(*) FROM product_models", [], |r| r.get(0))
                .unwrap_or(0);
            max_seq = total;
        }

        let next_seq = max_seq + 1;
        Ok(format!("PM-{:03}", next_seq))
    }

    /// 获取所有动态配置的标准打孔数列表 (升序排列)
    pub fn get_hole_specs(&self) -> std::result::Result<Vec<i64>, String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT hole_count FROM product_hole_specs ORDER BY hole_count ASC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |r| r.get::<_, i64>(0))
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    /// 动态添加新的加工孔数规格
    pub fn add_hole_spec(&self, hole_count: i64) -> std::result::Result<(), String> {
        if hole_count < 0 {
            return Err("[CRITICAL] 产品孔数不能为负数".to_string());
        }
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO product_hole_specs (hole_count, remarks, sort_order) VALUES (?1, '', ?1)",
            params![hole_count],
        ).map_err(|e| format!("[CRITICAL] 添加孔数规格失败: {}", e))?;
        Ok(())
    }

    /// 删除指定的加工孔数规格 (若已有型号在使用则阻断)
    pub fn delete_hole_spec(&self, hole_count: i64) -> std::result::Result<(), String> {
        let conn = self.get_conn().map_err(|e| e.to_string())?;
        
        let in_use: i64 = conn.query_row(
            "SELECT COUNT(*) FROM product_models WHERE hole_count = ?1",
            params![hole_count],
            |r| r.get(0),
        ).unwrap_or(0);

        if in_use > 0 {
            return Err(format!(
                "[CRITICAL] 无法删除【{}孔】规格：已有 {} 个产品型号正在使用此孔数配置！",
                hole_count, in_use
            ));
        }

        conn.execute(
            "DELETE FROM product_hole_specs WHERE hole_count = ?1",
            params![hole_count],
        ).map_err(|e| format!("[CRITICAL] 删除孔数规格失败: {}", e))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_init_and_backup_restore() {
        let db = Database::new().expect("Database 初始化失败");
        let workshops = db.get_workshops().expect("获取工段失败");
        assert_eq!(workshops.len(), 0, "纯净白纸系统工段应为 0");

        let stations = db.get_stations(None).expect("获取站点失败");
        assert_eq!(stations.len(), 0, "纯净白纸系统站点应为 0");

        let employees = db.get_employees(None).expect("获取员工失败");
        assert_eq!(employees.len(), 0, "纯净白纸系统员工应为 0");

        let processes = db.get_processes(None).expect("获取工艺失败");
        assert_eq!(processes.len(), 0, "纯净白纸系统工艺应为 0");

        let models = db.get_product_models().expect("获取产品型号失败");
        assert_eq!(models.len(), 0, "纯净白纸系统产品型号应为 0");

        let stats = db.get_system_stats().expect("获取系统统计失败");
        assert_eq!(stats.total_records, 0, "记工流水应为 0");
        assert_eq!(stats.total_wages, 0.0, "工费支出应为 0");

        // 测试创建备份
        let backup_file = db.backup_database().expect("创建备份失败");
        let backup_path = Path::new("data/backups").join(&backup_file);
        assert!(backup_path.exists(), "备份文件必须实际存在");

        // 测试列出备份
        let backups = db.list_backups().expect("列出备份失败");
        assert!(!backups.is_empty(), "备份列表不应为空");

        // 测试还原备份
        db.restore_backup(&backup_file).expect("还原备份失败");

        // 验证还原后数据库依然可用且为 0
        let stations_after = db.get_stations(None).expect("还原后获取站点失败");
        assert_eq!(stations_after.len(), 0);
    }

    #[test]
    fn test_bicycle_rim_hole_specs() {
        let db = Database::new().expect("Database 初始化失败");
        let specs = db.get_hole_specs().expect("获取孔数规格失败");
        assert_eq!(specs, vec![16, 18, 20, 21, 24, 28, 32, 36], "孔数规格必须精确为自行车碳纤轮圈标准内置规格 [16, 18, 20, 21, 24, 28, 32, 36]");
    }

    #[test]
    fn test_independent_team_and_batch_record() {
        let db = Database::new().expect("Database 初始化失败");
        
        // 1. 验证预设部门与独立班组初始化
        let depts = db.get_departments().expect("获取部门失败");
        assert!(!depts.is_empty(), "必须包含预设部门");

        let teams = db.get_teams().expect("获取独立班组失败");
        assert!(!teams.is_empty(), "必须包含预设独立班组");

        // 2. 验证对空班组记工必须 Fail Loudly 报错
        let empty_team_id = teams[0].id.unwrap();
        let batch_input = TeamBatchRecordInput {
            record_date: "2026-10-16".to_string(),
            batch_no: "BATCH-TEST-001".to_string(),
            team_id: empty_team_id,
            station_id: 1,
            process_id: 1,
            total_quantity: 100,
            scrap_quantity: 2,
            unit_price: 15.5,
            notes: "测试班组记工".to_string(),
        };

        let result = db.add_team_batch_record(batch_input);
        assert!(result.is_err(), "空班组无在职员工记工时必须抛出阻止性异常");
        let err_msg = result.unwrap_err();
        assert!(err_msg.contains("[CRITICAL]"), "错误信息必须包含 [CRITICAL]");
    }
}

