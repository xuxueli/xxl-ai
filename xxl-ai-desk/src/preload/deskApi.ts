/*
 * DeskApi 类型聚合：由各领域模块的 preload API 契约组合而成。
 * @author xuxueli 2026-11-07
 */

import type { AppApi, ShellApi, UpdateApi } from '@modules/app/shared'
import type { AgentMemoryApi } from '@modules/agent/shared'
import type { BrowserApi } from '@modules/browser/shared'
import type { ChatApi, SessionApi } from '@modules/chat/shared'
import type { DiagnosticsApi } from '@modules/diagnostics/shared'
import type { FileApi } from '@modules/file/shared'
import type { GitApi } from '@modules/git/shared'
import type { McpApi } from '@modules/mcp/shared'
import type { ProjectApi } from '@modules/project/shared'
import type { ProviderApi } from '@modules/provider/shared'
import type { SettingsApi } from '@modules/settings/shared'
import type { SkillApi } from '@modules/skill/shared'
import type { TerminalApi } from '@modules/terminal/shared'

export interface DeskApi {
  app: AppApi
  update: UpdateApi
  settings: SettingsApi
  agentMemory: AgentMemoryApi
  provider: ProviderApi
  project: ProjectApi
  git: GitApi
  session: SessionApi
  chat: ChatApi
  terminal: TerminalApi
  fs: FileApi
  shell: ShellApi
  browser: BrowserApi
  mcp: McpApi
  skill: SkillApi
  diagnostics: DiagnosticsApi
}
