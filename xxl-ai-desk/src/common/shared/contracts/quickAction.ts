/*
 * 快捷操作跨进程契约：命令面板与全局快捷键共用。
 * @author xuxueli 2026-11-07
 */

/* 快捷操作标识（命令面板「快捷操作」区块，同时支持全局快捷键触发） */
export type QuickAction =
  | 'newChat'
  | 'agent'
  | 'mcp'
  | 'skill'
  | 'settings'
  | 'files'
  | 'terminal'
  | 'browser'

/* 快捷操作 → 快捷键绑定：键名小写、以 + 连接，mod 表示平台主修饰键（macOS ⌘ / 其他 Ctrl） */
export type ShortcutMap = Partial<Record<QuickAction, string>>

/* 快捷键默认值（主进程与渲染进程共用；mod = 平台主修饰键，macOS ⌘ / 其他 Ctrl）
 * 取值按助记字母：新建 N、Agent A、MCP M、SKILL K、设置 S、文件 F、终端 T、浏览器 B
 * 统一附加 Shift，避开输入框内 Cmd/Ctrl+A 全选、Cmd/Ctrl+F 搜索、Cmd/Ctrl+S 保存等系统默认快捷键 */
export const DEFAULT_SHORTCUTS: ShortcutMap = {
  newChat: 'mod+shift+n',
  agent: 'mod+shift+a',
  mcp: 'mod+shift+m',
  skill: 'mod+shift+k',
  settings: 'mod+shift+s',
  files: 'mod+shift+f',
  terminal: 'mod+shift+t',
  browser: 'mod+shift+b'
}
