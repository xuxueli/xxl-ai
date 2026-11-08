/*
* 导航配置：板块（section）→ 入口路径 / 顶栏标题 / 子菜单项 的唯一定义
* @author xuxueli 2026-10-18
*/

/* 一级板块标识 */
export type SectionKey = 'home' | 'plugin' | 'apps' | 'settings'

/* 子菜单项公共字段 */
interface NavItemBase {
  key: string
  labelKey: string
  /* 已全局注册的图标组件名 */
  icon?: string
  /* 在该条目上方展示分隔线（用于系统设置顶部功能组与常规组之间） */
  divider?: boolean
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

/* 应用中心 / 扩展中心 / 系统设置 三个板块的子菜单 */
export const NAV_SECTIONS: Record<Exclude<SectionKey, 'home'>, NavSection> = {
  apps: {
    key: 'apps',
    titleKey: 'appCenter.title',
    entryPath: '/apps/installed',
    items: [
      { key: 'installed', labelKey: 'appCenter.myApps', icon: 'ShoppingCartFull', path: '/apps/installed' },
      { key: 'market', labelKey: 'appCenter.market', icon: 'ShoppingTrolley', path: '/apps/market' }
    ]
  },
  plugin: {
    key: 'plugin',
    titleKey: 'plugin.title',
    entryPath: '/plugin/agent',
    items: [
      { key: 'agent', labelKey: 'plugin.agent', icon: 'MagicStick', path: '/plugin/agent' },
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
      { key: 'providers', labelKey: 'settings.providers', icon: 'Cpu', tab: 'providers' },
      { key: 'runtime', labelKey: 'settings.runtimeTab', icon: 'Monitor', tab: 'runtime' },
      { key: 'projects', labelKey: 'settings.projects', icon: 'Folder', tab: 'projects' },
      { key: 'general', labelKey: 'settings.general', icon: 'Setting', tab: 'general', divider: true },
      {
        key: 'personalization',
        labelKey: 'settings.personalization',
        icon: 'User',
        tab: 'personalization'
      },
      { key: 'about', labelKey: 'settings.about', icon: 'InfoFilled', tab: 'about' }
    ]
  }
}

/* 各板块入口路径（图标栏切换用） */
export const SECTION_ENTRY: Record<SectionKey, string> = {
  home: '/',
  plugin: NAV_SECTIONS.plugin.entryPath,
  apps: NAV_SECTIONS.apps.entryPath,
  settings: NAV_SECTIONS.settings.entryPath
}

/* 各板块图标（全局注册的图标组件名）：图标栏与顶栏标题共用同一来源 */
export const SECTION_ICON: Record<SectionKey, string> = {
  home: 'ChatDotRound',
  plugin: 'SetUp',
  apps: 'ShoppingTrolley',
  settings: 'Setting'
}

/* 由路由路径解析所属一级板块 */
export function sectionOfPath(path: string): SectionKey {
  if (path.startsWith('/plugin')) {
    return 'plugin'
  }
  if (path.startsWith('/apps')) {
    return 'apps'
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
  /* 应用中心：子应用页面不归属任何子菜单项，避免「应用列表」误高亮 */
  if (section === 'apps') {
    return item?.key ?? ''
  }
  return item?.key ?? items[0].key
}
