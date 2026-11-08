/*
 * IPC 网关：聚合各领域模块的处理器注册，本文件只做装配。
 *   - 直接引用各模块 main/ipc：注册意图只存在于组合根，避免模块 barrel 因 IPC 装配产生循环依赖；
 *   - 跨域编排所需的其它域能力在此注入。
 * @author xuxueli 2026-11-07
 */

import type { BrowserWindow } from 'electron'
import { createIpcContext } from '@common/main/ipc'
import { registerPlatformIpc } from '@modules/platform/main/ipc'
import { registerAppCenterIpc } from '@modules/appCenter/main/ipc'
import { registerSettingsIpc } from '@modules/settings/main/ipc'
import { registerAgentIpc } from '@modules/agent/main/ipc'
import { registerProviderIpc } from '@modules/provider/main/ipc'
import { registerProjectIpc } from '@modules/project/main/ipc'
import { registerChatIpc } from '@modules/chat/main/ipc'
import { registerGitIpc } from '@modules/git/main/ipc'
import { registerTerminalIpc } from '@modules/terminal/main/ipc'
import { registerFileIpc } from '@modules/file/main/ipc'
import { registerNoteIpc } from '@modules/apps/note/main/ipc'
import { registerBrowserIpc } from '@modules/browser/main/ipc'
import { registerMcpIpc } from '@modules/mcp/main/ipc'
import { registerSkillIpc } from '@modules/skill/main/ipc'
import { registerDiagnosticsIpc } from '@modules/diagnostics/main/ipc'
import { countSessionsByAgents, listSessionIdsByAgent, listSessionIdsByProject } from '@modules/chat/main'

/* 注册全部 IPC 处理器 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const ipc = createIpcContext(getWindow)
  registerPlatformIpc(ipc)
  registerAppCenterIpc(ipc)
  registerSettingsIpc(ipc)
  /* Agent 删除保护与会话占用统计由会话域提供，避免 agent 反向依赖 chat */
  registerAgentIpc(ipc, { countSessionsByAgents, listSessionIdsByAgent, listSessionIdsByProject })
  registerProviderIpc(ipc)
  registerProjectIpc(ipc)
  registerChatIpc(ipc)
  registerGitIpc(ipc)
  registerTerminalIpc(ipc)
  registerFileIpc(ipc)
  registerNoteIpc(ipc)
  registerBrowserIpc(ipc)
  registerMcpIpc(ipc)
  registerSkillIpc(ipc)
  registerDiagnosticsIpc(ipc)
}
