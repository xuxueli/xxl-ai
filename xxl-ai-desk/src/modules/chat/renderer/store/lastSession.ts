/*
 * 最后会话记忆：localStorage 读写最近打开的会话 id，供下次启动默认定位
 * @author xuxueli 2026-10-25
 */

/* 本地存储键名（渲染进程 UI 状态，不入库） */
const STORAGE_KEY = 'desk-last-session-id'

/* 读取最近打开的会话 id（无记录或读写异常时返回空串） */
export function readLastSessionId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

/* 记录最近打开的会话 id（空 id 不覆盖已有记录） */
export function writeLastSessionId(id: string): void {
  if (!id) {
    return
  }
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* 存储不可用时忽略，启动时回落到最近更新的会话 */
  }
}

/* 清除最近打开的会话记录（仅当记录与待删除会话一致时） */
export function clearLastSessionId(id: string): void {
  if (readLastSessionId() !== id) {
    return
  }
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 存储不可用时忽略 */
  }
}
