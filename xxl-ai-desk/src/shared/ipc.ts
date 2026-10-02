/* 主进程 / 预加载 / 渲染进程共享的类型定义 */

/* 供应商（OpenAI 兼容端点） */
export interface ProviderDTO {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  headers: Record<string, string>
  models: string[]
  enabled: boolean
  sort: number
  addTime: string
  updateTime: string
}

/* 会话 */
export interface SessionDTO {
  id: string
  title: string
  providerId: string
  modelId: string
  systemPrompt: string
  addTime: string
  updateTime: string
}

/* 已持久化的消息记录 */
export interface StoredMessage {
  id: string
  sessionId: string
  seq: number
  role: string
  content: string
  data: string
  addTime: string
}

/* 应用设置 */
export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  language: 'zh' | 'en'
  providerId: string
  modelId: string
  systemPrompt: string
}

/* 对话流式事件（主 → 渲染） */
export interface ChatEvent {
  sessionId: string
  type: 'delta' | 'thinking' | 'tool_start' | 'tool_end' | 'error' | 'done' | 'aborted'
  text?: string
  toolName?: string
  toolCallId?: string
  isError?: boolean
  message?: string
}

/* 预加载暴露给渲染进程的 API */
export interface DeskApi {
  app: {
    info(): Promise<{ version: string; platform: string }>
  }
  settings: {
    get(): Promise<AppSettings>
    save(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  provider: {
    list(): Promise<ProviderDTO[]>
    save(dto: Partial<ProviderDTO>): Promise<ProviderDTO>
    remove(id: string): Promise<void>
  }
  session: {
    list(): Promise<SessionDTO[]>
    create(input?: Partial<SessionDTO>): Promise<SessionDTO>
    update(id: string, patch: Partial<SessionDTO>): Promise<SessionDTO>
    rename(id: string, title: string): Promise<void>
    remove(id: string): Promise<void>
    messages(sessionId: string): Promise<StoredMessage[]>
    clear(sessionId: string): Promise<void>
  }
  chat: {
    send(input: { sessionId: string; text: string }): Promise<void>
    abort(sessionId: string): Promise<void>
    onEvent(cb: (event: ChatEvent) => void): () => void
  }
}

export const IPC = {
  appInfo: 'desk:app:info',
  settingsGet: 'desk:settings:get',
  settingsSave: 'desk:settings:save',
  providerList: 'desk:provider:list',
  providerSave: 'desk:provider:save',
  providerRemove: 'desk:provider:remove',
  sessionList: 'desk:session:list',
  sessionCreate: 'desk:session:create',
  sessionUpdate: 'desk:session:update',
  sessionRename: 'desk:session:rename',
  sessionRemove: 'desk:session:remove',
  sessionMessages: 'desk:session:messages',
  sessionClear: 'desk:session:clear',
  chatSend: 'desk:chat:send',
  chatAbort: 'desk:chat:abort',
  chatEvent: 'desk:chat:event'
} as const
