/*
 * 应用中心内置应用注册表：新增子应用时只在此登记。
 * @author xuxueli 2026-11-08
 */

/* 应用分类 */
export const APP_CATEGORIES = ['efficiency', 'content', 'file', 'ai'] as const
export type AppCategory = (typeof APP_CATEGORIES)[number]

/* 应用可用状态：建设中应用仅展示，不允许安装 */
export const APP_AVAILABILITIES = ['available', 'building'] as const
export type AppAvailability = (typeof APP_AVAILABILITIES)[number]

/* 内置应用描述 */
export interface BuiltinApp {
  /* 应用标识 */
  id: string
  /* 名称词条 */
  titleKey: string
  /* 描述词条 */
  descKey: string
  /* 图标组件名 */
  icon: string
  /* 应用路由（建设中应用可缺省） */
  path?: string
  /* 分类 */
  category: AppCategory
  /* 可用状态 */
  availability: AppAvailability
}

/* 内置应用列表（顺序即应用市场与图标栏展示顺序） */
export const BUILTIN_APPS: BuiltinApp[] = [
  {
    id: 'note',
    titleKey: 'note.title',
    descKey: 'appCenter.noteDesc',
    icon: 'Notebook',
    path: '/apps/note',
    category: 'efficiency',
    availability: 'available'
  },
  {
    id: 'official-account',
    titleKey: 'appCenter.officialAccount',
    descKey: 'appCenter.officialAccountDesc',
    icon: 'EditPen',
    category: 'content',
    availability: 'building'
  },
  {
    id: 'toolbox',
    titleKey: 'appCenter.toolbox',
    descKey: 'appCenter.toolboxDesc',
    icon: 'Tools',
    category: 'efficiency',
    availability: 'building'
  },
]

/* 由路由路径解析当前应用（应用自身页面） */
export function appOfPath(path: string): BuiltinApp | undefined {
  return BUILTIN_APPS.find(
    (app) =>
      Boolean(app.path) &&
      (path === app.path || path.startsWith(`${app.path}/`))
  )
}

/* 是否应用自身页面：应用页不渲染应用中心外壳子菜单 */
export function isAppPage(path: string): boolean {
  return Boolean(appOfPath(path))
}
