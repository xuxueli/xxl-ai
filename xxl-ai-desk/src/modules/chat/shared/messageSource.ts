/*
 * 消息来源：仅运行时注入消息写入，常规消息保持为空。
 * @author xuxueli 2026-11-08
 */

/* 运行时注入来源；常规消息不写该字段 */
export type MessageSource = 'runtime:continue'

/* 是否运行时注入消息 */
export function isRuntimeSource(source: MessageSource | null): boolean {
  return source !== null
}
