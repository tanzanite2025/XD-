/**
 * ERP UDS 1.0 - 强类型 IPC 通信驱动网关
 * 严格杜绝 any 与隐式丢失，通过泛型绑定确保参数与返回值 100% 编译期安全
 */

import { IpcCommandMap } from '../types/ipc';

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
      };
    };
  }
}

/**
 * 强类型后端 IPC 调用网关
 * 严格对齐 IpcCommandMap 的 Key，无参命令无需传递第二个参数，有参命令强类型校验
 */
export async function invokeBackend<K extends keyof IpcCommandMap>(
  cmd: K,
  args?: IpcCommandMap[K]['args']
): Promise<IpcCommandMap[K]['return']> {
  const tauri = window.__TAURI__;
  if (!tauri?.core?.invoke) {
    throw new Error(`[CRITICAL] 未检测到 Tauri Core IPC 运行时，无法执行指令: ${String(cmd)}`);
  }
  return await tauri.core.invoke<IpcCommandMap[K]['return']>(
    cmd as string,
    args as Record<string, unknown> | undefined
  );
}
