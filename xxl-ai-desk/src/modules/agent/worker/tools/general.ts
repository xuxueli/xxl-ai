/*
 * 通用类内置工具：当前时间等无副作用的能力。
 */

import type { AgentTool } from '@earendil-works/pi-agent-core'
import { ALL_PERMISSIONS, describe, text, type ToolContext, type ToolEntry } from '@modules/agent/worker/toolkit'

/* 构建通用类工具 */
export async function createGeneralTools(_context: ToolContext): Promise<ToolEntry[]> {
  const { obj, opt, str } = await import('@earendil-works/pi-schema')

  /* 获取当前时间：本地日期时间，可选 IANA 时区 */
  const getCurrentTime: AgentTool = {
    name: 'get_current_time',
    label: '获取当前时间',
    description: describe(
      '获取本地当前日期与时间，可选传入 IANA 时区名称',
      'Get the current local date and time; an IANA timezone name is optional.'
    ),
    parameters: obj({
      timezone: opt(str({ description: 'IANA 时区，如 Asia/Shanghai' }))
    }),
    execute: async (_toolCallId, params) => {
      const timezone = (params as { timezone?: string }).timezone
      let value = new Date().toString()
      try {
        value = new Intl.DateTimeFormat('zh-CN', {
          dateStyle: 'full',
          timeStyle: 'medium',
          timeZone: timezone
        }).format(new Date())
      } catch {
        /* 时区非法时回退本地时间 */
      }
      return text(value, { timezone: timezone ?? '' })
    }
  }

  return [
    {
      meta: {
        group: 'general',
        readOnly: true,
        permissionModes: ALL_PERMISSIONS,
        maxOutput: 2000
      },
      tool: getCurrentTime
    }
  ]
}
