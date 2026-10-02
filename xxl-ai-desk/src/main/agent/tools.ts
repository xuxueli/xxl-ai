import type { AgentTool } from '@earendil-works/pi-agent-core'

/*
 * 内置工具集合。
 * 通过动态 import 加载 Pi 的类型构造器，避免 CJS 主进程静态引入 ESM 包。
 */
export async function createBuiltinTools(): Promise<AgentTool[]> {
  const { Type } = await import('@earendil-works/pi-ai')

  const getCurrentTime: AgentTool = {
    name: 'get_current_time',
    label: '获取当前时间',
    description: '获取本地当前日期与时间，可选传入 IANA 时区名称',
    parameters: Type.Object({
      timezone: Type.Optional(Type.String({ description: 'IANA 时区，如 Asia/Shanghai' }))
    }),
    execute: async (_toolCallId, params) => {
      const timezone = (params as { timezone?: string }).timezone
      let text = new Date().toString()
      try {
        text = new Intl.DateTimeFormat('zh-CN', {
          dateStyle: 'full',
          timeStyle: 'medium',
          timeZone: timezone
        }).format(new Date())
      } catch {
        /* 时区非法时回退本地时间 */
      }
      return { content: [{ type: 'text', text }], details: {} }
    }
  }

  return [getCurrentTime]
}
