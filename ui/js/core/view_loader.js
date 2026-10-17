/**
 * ERP UDS 1.0 - 视图与弹窗动态装载引擎 (View Loader)
 */

const viewCache = new Map();
const modalCache = new Map();

/**
 * 异步获取 HTML 视图片段
 */
async function fetchHtml(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`[CRITICAL] 模板文件加载失败: ${url} (状态码: ${resp.status})`);
  }
  return await resp.text();
}

/**
 * 装载并挂载指定视图
 * @param {string} viewName 例如 'rapid_entry'
 * @param {HTMLElement} container 挂载目标容器
 */
export async function loadView(viewName, container) {
  let html = viewCache.get(viewName);
  if (!html) {
    html = await fetchHtml(`views/${viewName}.html`);
    viewCache.set(viewName, html);
  }

  // 检查是否已经在容器中存在该 section
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const section = tempDiv.firstElementChild;
  if (!section) {
    throw new Error(`[CRITICAL] 视图 ${viewName} 的根元素解析为空`);
  }

  const existing = document.getElementById(section.id);
  if (existing) {
    return existing;
  }

  container.appendChild(section);
  return section;
}

/**
 * 预装载所有模态弹窗至弹窗挂载容器
 * @param {string[]} modalNames 弹窗模板名称数组
 * @param {HTMLElement} container 挂载容器
 */
export async function loadModals(modalNames, container) {
  for (const name of modalNames) {
    try {
      let html = modalCache.get(name);
      if (!html) {
        html = await fetchHtml(`modals/${name}.html`);
        modalCache.set(name, html);
      }
      
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const modalEl = tempDiv.firstElementChild;
      if (modalEl && !document.getElementById(modalEl.id)) {
        container.appendChild(modalEl);
      }
    } catch (err) {
      console.error(`[CRITICAL] 弹窗 ${name} 装载失败`, err);
    }
  }

  // 绑定所有关闭按钮事件
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.onclick = () => {
      const modal = btn.closest('.uds-modal-backdrop');
      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
      }
    };
  });
}

/**
 * 打开弹窗通用辅助函数
 */
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) {
    console.error(`[CRITICAL] 试图打开不存在的弹窗: ${modalId}`);
    return;
  }
  modal.style.display = 'flex';
  modal.classList.add('active');
}

/**
 * 关闭弹窗通用辅助函数
 */
export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('active');
  modal.style.display = 'none';
}
