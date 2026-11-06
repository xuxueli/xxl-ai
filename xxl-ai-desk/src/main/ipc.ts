/*
 * IPC 网关：聚合各领域模块的处理器注册，本文件只做装配。
 * @author xuxueli 2026-11-07
 */

import type { BrowserWindow } from 'electron'
import { createIpcContext } from '@common/main/ipc'
import { registerAppIpc } from '@modules/app/main'
import { registerSettingsIpc } from '@modules/settings/main'
import { registerAgentIpc } from '@modules/agent/main'
import { registerProviderIpc } from '@modules/provider/main'
import { registerProjectIpc } from '@modules/project/main'
import { registerChatIpc } from '@modules/chat/main'
import { registerGitIpc } from '@modules/git/main'
import { registerTerminalIpc } from '@modules/terminal/main'
import { registerFileIpc } from '@modules/file/main'
import { registerBrowserIpc } from '@modules/browser/main'
import { registerMcpIpc } from '@modules/mcp/main'
import { registerSkillIpc } from '@modules/skill/main'
import { registerDiagnosticsIpc } from '@modules/diagnostics/main'

/* 注册全部 IPC 处理器 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const ipc = createIpcContext(getWindow)
  registerAppIpc(ipc)
  registerSettingsIpc(ipc)
  registerAgentIpc(ipc)
  registerProviderIpc(ipc)
  registerProjectIpc(ipc)
  registerChatIpc(ipc)
  registerGitIpc(ipc)
  registerTerminalIpc(ipc)
  registerFileIpc(ipc)
  registerBrowserIpc(ipc)
  registerMcpIpc(ipc)
  registerSkillIpc(ipc)
  registerDiagnosticsIpc(ipc)
}
