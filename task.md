# 任务规划：三级组织架构 (部门-工段-工位) 与独立班组 (单人/集体双模式记工) 系统

## 任务背景与目标
根据用户决策要求：
1. **三级树形管理**：构建【一级部门】->【二级车间/工段】->【三级工位】层级体系，支持动态维护；员工档案中工位按此规范层级级联选择；
2. **独立班组管理 (不归于树形)**：建立独立的班组主数据配置字典（如铺叠一班、打孔成型组等），支持动态增删维护；员工档案中所属班组彻底告别手输，改为从独立班组库下拉选择；
3. **流水记工双核算模式**：流水记工台支持【单人记工】与【班组集体记工】无缝切换。选择班组集体记工时，自动将批次产量与工费平分核算到班组成员个人名下，确保对账、工资条打印与财务核算全流程闭环；
4. 编译构建并交付最新版本。

---

## 任务拆解清单

- [ ] **1. 阶段一：规划与方案确认 (Planning)** <!-- id: org_team_p1 -->
  - [x] 细化三级组织（部门-工段-工位）与独立班组（横向从属）实体设计 <!-- id: org_team_p1_1 -->
  - [x] 细化单人与班组集体记工核算拆解逻辑 <!-- id: org_team_p1_2 -->
  - [x] 编写 `task.md` 与 `implementation_plan.md` <!-- id: org_team_p1_3 -->
  - [ ] 请求用户审查批准规划 <!-- id: org_team_p1_confirm -->

- [ ] **2. 阶段二：后端数据库与 IPC 扩展 (Backend Execution)** <!-- id: org_team_p2 -->
  - [ ] **2.1 数据库结构升级** (`src-tauri/src/db.rs` & `models.rs`):
    - 创建 `departments` 部门表与预设数据（制造部、质检部、工程工艺部）；
    - `workshops` 关联 `department_id`；
    - 创建 `teams` 独立班组表与预设数据（铺叠一班、成型组、打孔组、编轮组、质检包装组）；
    - `employees` 关联 `team_id`，保留与班组的独立从属；
    - `work_records` 增加 `team_id` 字段以支持集体记工溯源；
  - [ ] **2.2 新增 IPC 指令** (`src-tauri/src/commands.rs` & `main.rs`):
    - 部门管理：`get_departments`, `save_department`, `delete_department`；
    - 独立班组管理：`get_teams`, `save_team`, `delete_team`；
    - 班组记工接口：`add_team_batch_record`（自动按班组成员平分记工明细）；

- [ ] **3. 阶段三：前端界面与交互组件改造 (Frontend Execution)** <!-- id: org_team_p3 -->
  - [ ] **3.1 员工档案弹窗升级** (`ui/modals/modal_employee.html` & `employees.js`):
    - “所属班组”改为独立下拉框，支持 `+ 管理班组` 快捷维护；
    - 常驻工位下拉框支持带【部门·工段】三级归属清晰展示；
  - [ ] **3.2 新增班组主数据配置弹窗** (`ui/modals/modal_team_specs.html`):
    - 独立的班组配置池（Chips展示、增删维护）；
  - [ ] **3.3 车间工位拓扑与部门三级联动** (`ui/views/stations.html` & `stations.js`):
    - 工位管理支持关联所属部门与工段；
  - [ ] **3.4 车间记工台升级为【单人/班组双模式】** (`ui/views/rapid_entry.html` & `rapid_entry.js`):
    - 作业主体支持【个人作业】与【班组集体】切换；
    - 选班组时自动带出该班组在岗人数并平分应发工费，一键提交；

- [ ] **4. 阶段四：编译构建与交付验证 (Verification)** <!-- id: org_team_p4 -->
  - [ ] 运行 `scratch/build_ansi.bat` 编译最新二进制；
  - [ ] 运行 `scratch/replace_exe.ps1` 覆盖更新 `计件管理系统.exe`；
  - [ ] 验证三级树形展示、班组独立配置与班组集体记工功能，输出交付报告。
