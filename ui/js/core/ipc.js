/**
 * ERP UDS 1.0 - 核心通信层 (IPC)
 * 遵循 Fail Loudly 原则：任何后端报错与未就绪必须阻断报错并显式记录
 */

export async function invokeBackend(command, args = {}) {
  if (!window.__TAURI__ || !window.__TAURI__.core) {
    const errMsg = `[CRITICAL] Tauri IPC 内核未加载，指令 ${command} 无法发送`;
    console.error(errMsg);
    throw new Error(errMsg);
  }

  try {
    return await window.__TAURI__.core.invoke(command, args);
  } catch (err) {
    console.error(`[CRITICAL IPC FAILURE] 接口: ${command}`, { args, error: err });
    throw err;
  }
}
