/**
 * ERP UDS 1.0 - 核心主入口调度中心 (Main Application Bootstrapper)
 */

import { state, loadMasterData, refreshSystemStats } from './core/state.js';
import { loadView, loadModals } from './core/view_loader.js';
import { showToast } from './core/toast.js';

import rapidEntryModule from './modules/rapid_entry.js';
import stationsModule from './modules/stations.js';
import productModelsModule from './modules/product_models.js';
import processesModule from './modules/processes.js';
import payrollModule from './modules/payroll.js';
import employeesModule from './modules/employees.js';
import vaultModule from './modules/vault.js';
import printEngine from './modules/print_engine.js';

const VIEW_MAP = {
  'tab-rapid-entry': { file: 'rapid_entry', module: rapidEntryModule },
  'tab-stations': { file: 'stations', module: stationsModule },
  'tab-product-models': { file: 'product_models', module: productModelsModule },
  'tab-processes': { file: 'processes', module: processesModule },
  'tab-payroll': { file: 'payroll', module: payrollModule },
  'tab-employees': { file: 'employees', module: employeesModule },
  'tab-vault': { file: 'vault', module: vaultModule },
};

const initializedModules = new Set();

/**
 * 切换活跃 Tab 模块
 */
async function switchTab(tabId) {
  const item = VIEW_MAP[tabId];
  if (!item) {
    console.error(`[CRITICAL] 未注册的视图 Tab: ${tabId}`);
    return;
  }

  state.activeTab = tabId;

  // 更新 Tab 导航高亮
  document.querySelectorAll('.uds-nav-tab').forEach(btn => {
    if (btn.dataset.tab === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const container = document.getElementById('app-view-container');
  if (!container) {
    console.error('[CRITICAL] 缺少主视图容器 #app-view-container');
    return;
  }

  // 确保该视图已加载并挂载
  let section = document.getElementById(tabId);
  if (!section) {
    section = await loadView(item.file, container);
  }

  // 隐藏其余所有 section，仅展示当前 section
  container.querySelectorAll('.tab-content').forEach(s => {
    s.style.display = 'none';
  });
  section.style.display = 'flex';

  // 首次装载时触发 init
  if (!initializedModules.has(tabId)) {
    if (item.module && typeof item.module.init === 'function') {
      await item.module.init();
    }
    initializedModules.add(tabId);
  }

  // 激活模块
  if (item.module && typeof item.module.onActivated === 'function') {
    await item.module.onActivated();
  }
}

/**
 * 系统初始化主引导
 */
async function bootstrap() {
  try {
    // 1. 预装载所有独立业务弹窗
    const modalNames = [
      'modal_employee',
      'modal_team_specs',
      'modal_station',
      'modal_station_staff',
      'modal_process',
      'modal_product_model',
      'modal_price_change',
      'modal_print_preview',
      'modal_hole_specs'
    ];
    const modalsContainer = document.getElementById('app-modal-container');
    if (modalsContainer) {
      await loadModals(modalNames, modalsContainer);
      printEngine.init();
    }

    // 2. 加载全厂主数据
    await loadMasterData();

    // 3. 绑定 Tab 导航栏点击事件
    document.querySelectorAll('.uds-nav-tab').forEach(btn => {
      btn.onclick = () => {
        const targetTab = btn.dataset.tab;
        if (targetTab) {
          switchTab(targetTab);
        }
      };
    });

    // 4. 默认挂载极速记工 Tab
    await switchTab('tab-rapid-entry');

    console.info('[SYSTEM READY] 计件管理系统 ERP UDS 1.0 模块化初始化完成');
  } catch (err) {
    console.error('[CRITICAL BOOTSTRAP FAILURE]', err);
    showToast(`系统引导初始化异常: ${err.message || err}`, true);
  }
}

// 启动应用
document.addEventListener('DOMContentLoaded', bootstrap);
