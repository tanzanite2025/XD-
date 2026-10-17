# 三级组织架构 (部门-工段-工位) 与独立班组 (单人/集体双模式记工) 系统实施方案

## 1. 方案背景与需求分析

用户指令：
“登记员工档案里面，我觉得班组是否也要比如一个树形三级的这种管理，动态录入什么部门，什么工位，然后班组是独立的一个从属，不要归于树形，就是我选择的时候可以选班组，也可以直接选人，但是这是独立的班组数据，不要嵌入三级树形”

### 核心设计原则与业务洞察：
1. **三级树形管理（纵向行政与生产组织结构）**：
   - 层级为：【一级部门（Department）】 -> 【二级车间/工段（Workshop）】 -> 【三级工位（Station）】；
   - 部门与工段动态录入维护，工位隶属于车间工段，工段隶属于部门；
   - 员工建档时，常驻主工位根据三级树形结构进行级联归属展示（例如：`[制造部 · 前段复材成型工段] 模具铺叠成型站`）。
2. **班组独立从属原则（横向作业协同实体）**：
   - **严格禁止将班组硬塞入纵向三级树中**！
   - 班组（如“铺叠一班”、“热压成型组”、“编轮二班”等）是独立的横向编组字典，具有跨工位甚至跨工段机动作业属性；
   - 员工建档时，所属班组由独立班组配置库下拉选取，彻底告别手工自由打字；后台提供专属弹窗维护班组增删改；
3. **流水记工双核算模式（选人 / 选班组双轨制）**：
   - 记工台提供【个人记工】与【班组集体记工】切换；
   - **单人记工**：针对独立机台操作（如钻孔、精修、质检），直接选工人；
   - **班组集体记工**：针对多人协同流水（如铺叠、编轮），选择班组后，系统自动带出该班组在册在岗成员数量，并自动将这批轮圈的计件总额均匀拆分核算至班组成员名下，生成带班组溯源标签的工费流水，无缝衔接个人工资条核算与打印！

---

## 2. 数据库与技术方案设计

### 2.1 数据库结构升级 (`src-tauri/src/db.rs`)

1. **新建 `departments` 表（一级部门）**：
   ```sql
   CREATE TABLE IF NOT EXISTS departments (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       dept_code TEXT NOT NULL UNIQUE,
       dept_name TEXT NOT NULL,
       sort_order INTEGER DEFAULT 0
   );
   ```
   预设：`DEP-01 (生产制造部)`, `DEP-02 (质量保证部)`, `DEP-03 (工艺工程部)`。

2. **升级 `workshops` 表（二级车间工段）**：
   - 增加字段 `department_id INTEGER DEFAULT 1`（自动 PRAGMA 检查升级），建立到部门的父级关联。

3. **新建 `teams` 表（独立从属班组实体）**：
   ```sql
   CREATE TABLE IF NOT EXISTS teams (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       team_code TEXT NOT NULL UNIQUE,
       team_name TEXT NOT NULL,
       leader_name TEXT DEFAULT '',
       remarks TEXT DEFAULT '',
       sort_order INTEGER DEFAULT 0
   );
   ```
   预设：`TM-01 (碳纤铺叠一班)`, `TM-02 (碳纤铺叠二班)`, `TM-03 (轮圈热压成型组)`, `TM-04 (数控钻孔打孔班)`, `TM-05 (碳纤编轮总装班)`, `TM-06 (成品动平衡质检组)`。

4. **升级 `employees` 表**：
   - 增加 `team_id INTEGER`，并关联到 `teams` 表。

5. **升级 `work_records` 表**：
   - 增加 `team_id INTEGER`，支持标记是否为班组集体记工批次。

### 2.2 IPC 接口设计 (`src-tauri/src/commands.rs`)
- `get_departments` / `save_department` / `delete_department`：维护部门；
- `get_teams` / `save_team` / `delete_team`：维护独立班组；
- `add_team_batch_record(team_id, station_id, process_id, batch_no, date, qty, scrap)`：后端事务化原子操作，获取该班组全体成员，按人均平分数量与工费生成每位成员的流水记录，避免前端并发提交的不一致性。

### 2.3 前端组件与界面交互设计
1. **员工建档弹窗 (`ui/modals/modal_employee.html`)**：
   - 所属班组：改造为 `<select id="emp-team-select">`，后附 `+ 管理班组配置` 快捷按钮；
   - 常驻主工位：下拉选项格式化为 `[部门 · 工段] 工位编号 - 工位名称`，一目了然；
2. **新增班组管理弹窗 (`ui/modals/modal_team_specs.html`)**：
   - 工业图纸风格 Chips 药丸标签池，直观展示已有班组及在册人数，支持快速新增/删除班组；
3. **车间流水记工录入台 (`ui/views/rapid_entry.html`)**：
   - 作业主体切换：`[个人作业记工 / 班组集体记工]` 单选/开关切换；
   - 切换为班组时，作业人员下拉变为“作业班组选择”；选择班组后，显示“当前班组共 N 名成员，将按件均匀平分记录工费”。

---

## 3. 潜在风险与防御措施

1. **班组删除安全性**：若班组下已有员工归属，严格禁止物理删除该班组，抛出 `[CRITICAL]` 阻断提示；
2. **班组集体记工空班组防御**：若选中的班组暂无在职员工，严格阻断记工提交，并提示“该班组暂无在册员工，无法核算集体计件”。

---

## 4. 涉及修改文件清单
- **后端**：
  - `src-tauri/src/models.rs`（新增 Department, Team 数据模型，扩展 Employee, WorkRecord 字段）
  - `src-tauri/src/db.rs`（建表、升级迁移脚本、增删查与班组记工事务逻辑）
  - `src-tauri/src/commands.rs`（暴露对应 Tauri IPC 接口）
  - `src-tauri/src/main.rs`（注册新命令）
- **前端**：
  - `ui/modals/modal_employee.html`（所属班组改下拉 + 常驻工位带三级前缀）
  - `ui/modals/modal_team_specs.html`（新增独立班组配置弹窗）
  - `ui/views/rapid_entry.html`（记工台支持单人/班组双模式切换）
  - `ui/js/modules/employees.js`（对接班组下拉与三级工位回填）
  - `ui/js/modules/rapid_entry.js`（对接班组集体记工核算逻辑）
  - `ui/js/main.js`（预装载新弹窗）
- **可执行文件**：
  - 根目录下 `计件管理系统.exe`

