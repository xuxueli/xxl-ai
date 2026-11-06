/*
 * Agent 域跨进程契约：Agent 记忆（按项目维度保存，一个项目一条）。
 */

import { HISTORY_MAX_MESSAGES } from '@modules/chat/shared'

/* 记忆固定长度上限（字符） */
export const AGENT_MEMORY_MAX_CHARS = 2000

/* Agent 指令长度上限（字符） */
export const AGENT_INSTRUCTION_MAX_CHARS = 2000

/*
 * 记忆生成触发阈值：项目内自上次生成后积压的消息数达到该值即压缩。
 * 与上下文历史窗口保持一致：积压超过窗口，意味着最早的内容即将被挤出上下文。
 */
export const AGENT_MEMORY_MESSAGE_LIMIT = HISTORY_MAX_MESSAGES

/* 项目记忆：无记忆时 content / lastMessageTime / updateTime 为空串 */
export interface AgentMemoryDTO {
  /* 项目主键（记忆唯一键） */
  projectId: string
  /* 项目名 */
  projectName: string
  /* 记忆正文（Markdown，固定四段） */
  content: string
  /* 上次生成纳入的最后一条消息时间（项目级游标，ISO） */
  lastMessageTime: string
  /* 更新时间（ISO），未生成过为空串 */
  updateTime: string
}

/* 保存记忆入参（手动编辑） */
export interface AgentMemorySaveInput {
  /* 项目主键 */
  projectId: string
  /* 记忆正文 */
  content: string
}
