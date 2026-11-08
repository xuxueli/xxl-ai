/*
 * 预加载入口：聚合各领域模块的 DeskApi 片段，经 contextBridge 注入 window.desk。
 * @author xuxueli 2026-11-07
 */

import { contextBridge } from 'electron'
import { appApi, shellApi, updateApi } from '@modules/platform/preload'
import { appCenterApi } from '@modules/appCenter/preload'
import { agentApi } from '@modules/agent/preload'
import { noteApi } from '@modules/apps/note/preload'
import { browserApi } from '@modules/browser/preload'
import { chatApi, sessionApi } from '@modules/chat/preload'
import { diagnosticsApi } from '@modules/diagnostics/preload'
import { fileApi } from '@modules/file/preload'
import { gitApi } from '@modules/git/preload'
import { mcpApi } from '@modules/mcp/preload'
import { projectApi } from '@modules/project/preload'
import { providerApi } from '@modules/provider/preload'
import { settingsApi } from '@modules/settings/preload'
import { skillApi } from '@modules/skill/preload'
import { terminalApi } from '@modules/terminal/preload'
import type { DeskApi } from './deskApi'

const api: DeskApi = {
  app: appApi,
  update: updateApi,
  settings: settingsApi,
  agent: agentApi,
  provider: providerApi,
  project: projectApi,
  git: gitApi,
  session: sessionApi,
  chat: chatApi,
  terminal: terminalApi,
  fs: fileApi,
  shell: shellApi,
  browser: browserApi,
  mcp: mcpApi,
  skill: skillApi,
  diagnostics: diagnosticsApi,
  note: noteApi,
  appCenter: appCenterApi
}

contextBridge.exposeInMainWorld('desk', api)
