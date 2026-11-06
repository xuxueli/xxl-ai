/*
 * 文件类内置工具入口：按读 / 写职责聚合，保持注册表只依赖单一工厂。
 *   - 读取类见 fsRead.ts，写入 / 删除 / 移动见 fsWrite.ts；
 *   - 两类共用统一沙箱闸门与元信息规范。
 *
 * @author xuxueli 2026-10-31
 */

import type { ToolContext, ToolEntry } from '@modules/agent/worker'
import { createFsReadTools } from '@modules/file/worker/fsRead'
import { createFsWriteTools } from '@modules/file/worker/fsWrite'

/* 构建文件类工具（读取 + 写入，顺序即装配顺序） */
export async function createFsTools(context: ToolContext): Promise<ToolEntry[]> {
  const readTools = await createFsReadTools(context)
  const writeTools = await createFsWriteTools(context)
  return [...readTools, ...writeTools]
}
