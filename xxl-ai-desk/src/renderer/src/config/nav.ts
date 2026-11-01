/*
* 导航配置：板块（section）→ 入口路径 / 顶栏标题 / 子菜单项 的唯一定义
* @author xuxueli 2026-10-18
*/

/* 一级板块标识 */
export type SectionKey = 'home' | 'agent' | 'plugin' | 'settings'

/* 子菜单项公共字段 */
interface NavItemBase {
  key: string
  labelKey: string
  /* 已全局注册的图标组件名 */
  icon?: string
}

/* 子菜单项：路由项跳 path，设置项切 tab（二者互斥，避免运行时靠真值猜测） */
export type NavItem =
  | (NavItemBase & { path: string; tab?: never })
  | (NavItemBase & { tab: string; path?: never })

/* 板块子菜单定义（首页为自定义面板，不在此列） */
export interface NavSection {
  key: SectionKey
  titleKey: string
  entryPath: string
  items: NavItem[]
}

/* Agent / 插件 / 系统设置 三个板块的子菜单 */
export const NAV_SECTIONS: Record<Exclude<SectionKey, 'home'>, NavSection> = {
  agent: {
    key: 'agent',
    titleKey: 'agent.title',
    entryPath: '/agent/instructions',
    items: [
      { key: 'instructions', labelKey: 'agent.instructions', icon: 'Document', path: '/agent/instructions' },
      { key: 'memory', labelKey: 'agent.memory', icon: 'Clock', path: '/agent/memory' }
    ]
  },
  plugin: {
    key: 'plugin',
    titleKey: 'plugin.title',
    entryPath: '/plugin/mcp',
    items: [
      { key: 'mcp', labelKey: 'plugin.mcp', icon: 'Connection', path: '/plugin/mcp' },
      { key: 'skill', labelKey: 'plugin.skill', icon: 'Notebook', path: '/plugin/skill' },
      { key: 'builtin', labelKey: 'plugin.builtin', icon: 'Operation', path: '/plugin/builtin' }
    ]
  },
  settings: {
    key: 'settings',
    titleKey: 'settings.title',
    entryPath: '/settings',
    items: [
      { key: 'general', labelKey: 'settings.general', icon: 'Setting', tab: 'general' },
      {
        key: 'personalization',
        labelKey: 'settings.personalization',
        icon: 'User',
        tab: 'personalization'
      },
      { key: 'providers', labelKey: 'settings.providers', icon: 'Cpu', tab: 'providers' },
      { key: 'runtime', labelKey: 'settings.runtimeTab', icon: 'Monitor', tab: 'runtime' },
      { key: 'about', labelKey: 'settings.about', icon: 'InfoFilled', tab: 'about' }
    ]
  }
}

/* 各板块入口路径（图标栏切换用） */
export const SECTION_ENTRY: Record<SectionKey, string> = {
  home: '/',
  agent: NAV_SECTIONS.agent.entryPath,
  plugin: NAV_SECTIONS.plugin.entryPath,
  settings: NAV_SECTIONS.settings.entryPath
}

/* 各板块图标（全局注册的图标组件名）：图标栏与顶栏标题共用同一来源 */
export const SECTION_ICON: Record<SectionKey, string> = {
  home: 'ChatDotRound',
  agent: 'MagicStick',
  plugin: 'SetUp',
  settings: 'Setting'
}

/* 由路由路径解析所属一级板块 */
export function sectionOfPath(path: string): SectionKey {
  if (path.startsWith('/agent')) {
    return 'agent'
  }
  if (path.startsWith('/plugin')) {
    return 'plugin'
  }
  if (path.startsWith('/settings')) {
    return 'settings'
  }
  return 'home'
}

/* 由板块路由路径解析当前子菜单 key（未匹配时回落首项） */
export function navItemKey(section: Exclude<SectionKey, 'home'>, path: string): string {
  const items = NAV_SECTIONS[section].items
  const item = items.find((one) => one.path === path)
  return item?.key ?? items[0].key
}
