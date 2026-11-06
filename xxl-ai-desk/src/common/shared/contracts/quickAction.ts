/*
 * 快捷操作跨进程契约：命令面板与全局快捷键共用。
 * @author xuxueli 2026-11-07
 */

/* 快捷操作标识（命令面板「快捷操作」区块，同时支持全局快捷键触发） */
export type QuickAction =
  | 'newChat'
  | 'agent'
  | 'plugin'
  | 'settings'
  | 'terminal'
  | 'files'
  | 'browser'

/* 快捷操作 → 快捷键绑定：键名小写、以 + 连接，mod 表示平台主修饰键（macOS ⌘ / 其他 Ctrl） */
export type ShortcutMap = Partial<Record<QuickAction, string>>

/* 快捷键默认值（主进程与渲染进程共用；mod = 平台主修饰键，macOS ⌘ / 其他 Ctrl）
 * 取值按助记字母：新建 N、Agent A、插件 P、设置 S、终端 T、文件 F、浏览器 B
 * 统一附加 Shift，避开输入框内 Cmd/Ctrl+A 全选、Cmd/Ctrl+F 搜索、Cmd/Ctrl+S 保存等系统默认快捷键 */
export const DEFAULT_SHORTCUTS: ShortcutMap = {
  newChat: 'mod+shift+n',
  agent: 'mod+shift+a',
  plugin: 'mod+shift+p',
  settings: 'mod+shift+s',
  terminal: 'mod+shift+t',
  files: 'mod+shift+f',
  browser: 'mod+shift+b'
}
