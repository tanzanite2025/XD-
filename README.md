# 计件管理系统 (PIECEWORK COMMAND CENTER)

> **专为自行车碳纤维轮圈制造工厂打造的本地绿色桌面计件管理系统**  
> 基于 **Tauri 2.0 + Rust + 原生 SQLite + Vite + TypeScript (Strict Mode)** 构建，体积小（约 15MB）、内存低（30~50MB）、秒级启动，彻底告别 Electron 的庞大臃肿与无类型前端运行时的不可观测错误。  
> 界面严格遵循 **ERP UDS 视觉系统规范 (v1.0)**，配备工业级大圆角虚线设计与 Fail Loudly 零隐式兜底安全机制，全界面采用 100% 清爽浅色工业图纸风。

📖 **系统核心白皮书**：[碳纤维工厂计件管理系统架构设计白皮书](file:///c:/Users/P16V/Desktop/Github/计件管理系统/docs/architecture/carbon_fiber_piecework_system_architecture.md)

---

## 🚀 极速启动与开箱即用

在项目根目录下直接双击：
👉 **`计件管理系统.exe`** 即可开启桌面独立系统！首次启动自动在 `data/` 目录初始化数据库，白纸开局，行数与流水纯净清晰。

---

## 🛠️ 本地开发环境 (DEV) 运行指南

系统支持**前端浏览器极速热重载开发**与**桌面端完整前后端联动开发**两种模式，开发者可根据需求选择：

### 1. 环境准备要求
- **Node.js**：v18.0.0 以上（推荐 v20+ LTS），包含 `npm`；
- **Rust 工具链**：1.77.0 以上（包含 `cargo`）；
- **C++ 构建工具**：Windows 下推荐安装 Visual Studio 2022 “使用 C++ 的桌面开发”工作负载 (MSVC x64)；
- **WebView2 运行时**：Windows 10/11 操作系统默认已内置。

---

### 2. 模式 A：前端界面极速预览与热重载 (浏览器模式)
适用于快速调整 UI 布局、工业样式微调、表格表单交互排版，无需每次编译 Rust 后端。

1. **执行文件夹**：项目根目录 `计件管理系统/`
2. **执行命令**：
   ```powershell
   # 1. 首次运行需安装前端依赖 (TypeScript, Vite)
   npm install

   # 2. 启动 Vite 开发服务器 (支持毫秒级热更新 HMR)
   npm run dev
   ```
3. **访问与调试**：
   - 命令行输出完成后，直接在浏览器中打开：👉 **`http://localhost:5173`**
   - 修改 `src/` 下的任意 `.ts` 文件或 `style.css`，浏览器将瞬间实时局部热重载。

---

### 3. 模式 B：全栈桌面端实时调试 (Tauri 桌面热重载)
适用于调试前后端 IPC 通信、SQLite 真实数据库事务、物理备份与还原等完整业务闭环。

1. **执行文件夹**：项目根目录 `计件管理系统/`
2. **执行命令**：
   ```powershell
   # 启动全栈桌面开发窗口
   npm run tauri dev
   # 或在 src-tauri/ 目录下直接执行：
   # cd src-tauri && cargo tauri dev
   ```
3. **运行效果**：
   - 自动在后台启动 Vite 开发服务器；
   - 唤起原生桌面窗口并加载开发流；
   - 修改前端代码或 Rust 代码，桌面窗口将自动热更新或重新编译。

---

## 📦 生产打包与编译分发 (BUILD)

当功能开发完毕或需要生成正式交付的 Windows 桌面安装/独立绿色程序时，请按以下标准化三步执行：

### 第一步：静态类型检验 (保证 0 类型错误)
1. **执行文件夹**：项目根目录 `计件管理系统/`
2. **执行命令**：
   ```powershell
   npm run check
   ```
   > 依据 **FAIL LOUDLY (零容忍隐式兜底)** 规则，TypeScript 开启严格模式 (`strict: true`)，`tsc --noEmit` 静态检查必须达到 **0 错误、0 警告**方可进入下一步。

---

### 第二步：编译打包前端生产产物 (Vite Build)
1. **执行文件夹**：项目根目录 `计件管理系统/`
2. **执行命令**：
   ```powershell
   npm run build
   ```
3. **产物输出**：
   - 前端代码将被极速编译、混淆、压缩并打包输出至根目录的 **`dist/`** 文件夹；
   - 输出包括 `dist/index.html` 以及 `dist/assets/` 下的纯净 CSS 与 JS 静态包。

---

### 第三步：编译打包桌面端独立可执行程序 (.exe)
1. **执行文件夹**：进入后端目录 `计件管理系统/src-tauri/`
2. **执行命令**：
   ```powershell
   # 切换至后端目录
   cd src-tauri

   # 执行离线/在线 release 生产编译 (体积最小化、启动最快、无控制台黑框)
   cargo build --release --offline
   ```
   *(注：若需快速验证功能，亦可执行 `cargo build --offline` 生成 debug 版本)*

3. **最终交付物生成路径**：
   - 生产产物生成在：**`src-tauri/target/release/piecework-system.exe`**
   - （若为 debug 构建则在：`src-tauri/target/debug/piecework-system.exe`）

4. **复制覆盖分发**：
   - 将生成的 `piecework-system.exe` 复制到项目根目录下，重命名为 **`计件管理系统.exe`**；
   - 此文件为绿色独立执行程序，直接发给工厂管理员或车间现场电脑即可双击直接运行！

---

## 🧪 自动化测试验证

系统针对核心业务逻辑建立了严格的自动化单元与集成测试套件：
1. **执行文件夹**：`src-tauri/` 目录
2. **运行命令**：
   ```powershell
   cd src-tauri
   cargo test --offline
   ```
3. **覆盖的核心验证项**：
   - `test_bicycle_rim_hole_specs`：轮圈标准孔数（16~36孔）物理防呆与主数据完整性；
   - `test_db_init_and_backup_restore`：SQLite 数据库冷备份、前置救援快照生成与安全恢复；
   - `test_independent_team_and_batch_record`：独立班组集体记工自动均摊与个人记工双核算闭环。

---

## 🎯 核心业务架构与工业规范

### 1. 自行车碳纤维轮圈标准孔数与主数据驱动
- **产品型号管理主数据**：统筹管理全厂所有碳纤维轮圈型号规格，编号全自动化生成，禁止手动输入冲突。
- **碳纤维轮圈标准内置孔数**：严格限定为 **`16, 18, 20, 21, 24, 28, 32, 36`** 八种行业标准规格，其他非标孔数彻底移除。
- **全系统输入强防呆**：工艺库与记工节点 100% 从主数据中心下拉单选读取型号与对应孔数规格，彻底终结手输造成的统计核算灾难。
- **工艺防误删保护**：当型号已被下游工序使用时，系统依据 Fail Loudly 原则阻止物理删除并阻断告警。

### 2. 部门-车间-工位三级树形管理 & 独立从属班组
- **三级组织树形结构**：支持动态录入与维护【部门】➔【车间】➔【工位】三级层级。
- **班组实体独立解耦**：班组为独立的从属数据，不嵌入三级树形。员工可归属于特定工位，同时也可独立加入班组。
- **记工台双核算支持**：记工时既可选择班组进行团队批量核算（自动按班组成员均摊/生成对应工票），也可直接单选人员进行个人独立核算。

### 3. 数据安全与保险箱 (备份与还原中枢)
1. **一键物理快照生成**：毫秒级复制并锁定一份完整的 `data/backups/piecework_backup_YYYYMMDD_HHMMSS.db` 副本。
2. **直达 Windows 资源管理器**：一键唤起原生 Explorer 定位到备份文件夹，支持 U 盘或异地冷存。
3. **安全前置物理还原 (Restore)**：在执行任何还原覆盖前，系统**强制自动创建当前状态的救援快照**（`pre_restore_safety_...db`），绝不会因为手误还原而丢失当天生产数据！

### 4. 多维专项 Excel 报表导出体系 (双击即开·永不乱码)
所有导出的 CSV 文件开头均内置 UTF-8 BOM 标头 (`\u{FEFF}`)，在任何版本 Windows 系统的 Microsoft Office Excel 下双击打开 100% 正常显示中文：
1. **【生产流水明细总账】导出**：包含工单批次、工段工位、员工工号/姓名、班组、工艺代码/名称、产品型号与孔数、合格/废品数、单价快照、核算状态。
2. **【员工计件工资总账】导出**：包含员工工号、姓名、所属班组、常驻工位、记工笔数、总件数、废品数、应发计件总工资、已结算笔数。
3. **【工位车间产量汇总表】导出**：包含工位代码、工位名称、所属部门与车间、责任人、合格总产出、废品总数、工费总支出、流水笔数。

---

## 📂 项目完整文件职责全景

```
计件管理系统/
├── 计件管理系统.exe       # 桌面端独立单执行文件（双击直接运行，内嵌 WebView2 运行环境与数据库引擎）
├── package.json          # 前端工程依赖与构建脚本 (Vite + TypeScript)
├── tsconfig.json         # 严格模式 TypeScript 编译配置
├── vite.config.ts        # Vite 前端构建打包配置
├── index.html            # 现代前端主静态入口骨架 (UTF-8 纯正编码)
├── style.css             # ERP UDS 1.0 工业视觉图纸设计系统
├── dist/                 # 前端编译输出目录（Vite 打包产物，供 Tauri 离线嵌入）
│   ├── index.html
│   └── assets/           # 打包生成的生产级 JS 与 CSS
├── src/                  # 工业级 TypeScript 前端源码
│   ├── types/            # 强类型契约库 (models.ts 对齐 Rust，ipc.ts 对齐 37 个 IPC 命令)
│   ├── core/             # 前端核心引擎 (ipc.ts 泛型网关, state.ts 强类型状态机, toast.ts)
│   ├── modules/          # 核心业务模块 (employees, rapid_entry, stations, product_models, processes, payroll, vault, print_engine)
│   └── main.ts           # 现代前端主引导入口
├── data/                 # 本地持久化存储目录
│   ├── piecework.db      # SQLite 核心业务数据库（WAL 模式，包含产品主数据、工艺工价、流水账目）
│   └── backups/          # 物理历史快照存储目录（一键生成与带保护还原）
├── docs/architecture/    # 架构设计与工业标准白皮书
│   └── carbon_fiber_piecework_system_architecture.md
└── src-tauri/            # Tauri 2.0 Rust 后端工程
    ├── Cargo.toml        # Rust 依赖清单与离线构建元数据
    └── src/
        ├── main.rs       # 桌面端入口、目录防漂移锁定、全局崩溃系统级 MessageBox 捕获
        ├── db.rs         # SQLite 事务执行引擎、自动表结构升级、备份还原核心逻辑
        ├── models.rs     # 强类型数据模型定义
        └── commands.rs   # Tauri IPC 暴露命令集与 UTF-8 BOM Excel 报表生成器
```