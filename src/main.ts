/**
 * ERP UDS 1.0 - 核心主入口调度中心 (Main Application Bootstrapper)
 * 严格 TypeScript 强类型调度驱动
 */

import { state, loadMasterData } from './core/state';
import { bindModalCloseTriggers } from './core/view_loader';
import { showToast } from './core/toast';

import rapidEntryModule from './modules/rapid_entry';
import stationsModule from './modules/stations';
import productModelsModule from './modules/product_models';
import processesModule from './modules/processes';
import payrollModule from './modules/payroll';
import employeesModule from './modules/employees';
import vaultModule from './modules/vault';
import printEngine from './modules/print_engine';

interface AppModule {
  init?: () => Promise<void> | void;
  onActivated?: () => Promise<void> | void;
}

const VIEW_MAP: Record<string, AppModule> = {
  'tab-rapid-entry': rapidEntryModule,
  'tab-stations': stationsModule,
  'tab-product-models': productModelsModule,
  'tab-processes': processesModule,
  'tab-payroll': payrollModule,
  'tab-employees': employeesModule,
  'tab-vault': vaultModule,
};

const initializedModules = new Set<string>();

/**
 * 切换活跃 Tab 模块
 */
export async function switchTab(tabId: string): Promise<void> {
  const module = VIEW_MAP[tabId];
  if (!module) {
    console.error(`[CRITICAL] 未注册的视图 Tab: ${tabId}`);
    return;
  }

  state.activeTab = tabId;

  // 更新 Tab 导航高亮
  document.querySelectorAll<HTMLElement>('.uds-nav-tab').forEach(btn => {
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

  // 隐藏其余所有 section，仅展示当前 section
  container.querySelectorAll<HTMLElement>('.tab-content').forEach(s => {
    s.style.display = 'none';
  });

  const section = document.getElementById(tabId);
  if (section) {
    section.style.display = 'flex';
  }

  // 首次装载时触发 init
  if (!initializedModules.has(tabId)) {
    if (typeof module.init === 'function') {
      await module.init();
    }
    initializedModules.add(tabId);
  }

  // 激活模块
  if (typeof module.onActivated === 'function') {
    await module.onActivated();
  }
}

/**
 * 系统初始化主引导
 */
async function bootstrap(): Promise<void> {
  try {
    // 1. 绑定所有弹窗的关闭按钮
    bindModalCloseTriggers();
    printEngine.init();

    // 2. 加载全厂主数据
    await loadMasterData();

    // 3. 绑定 Tab 导航栏点击事件
    document.querySelectorAll<HTMLElement>('.uds-nav-tab').forEach(btn => {
      btn.onclick = () => {
        const targetTab = btn.dataset.tab;
        if (targetTab) {
          switchTab(targetTab);
        }
      };
    });

    // 4. 默认激活极速流水记工 Tab
    await switchTab('tab-rapid-entry');

    console.info('[SYSTEM READY] 计件管理系统 ERP UDS 1.0 (TypeScript Strict) 引导完成');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[CRITICAL BOOTSTRAP FAILURE]', err);
    showToast(`系统引导初始化异常: ${msg}`, true);
  }
}

// DOM 加载完成时启动应用
document.addEventListener('DOMContentLoaded', () => {
  bootstrap();
});
