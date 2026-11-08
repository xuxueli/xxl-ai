/*
* 桌面端路由：hash 模式，含对话页、设置页与兜底重定向
*/
import { createRouter, createWebHashHistory } from 'vue-router'
import type { Component } from 'vue'
import { NAV_SECTIONS } from '@renderer/shell/config/nav'

/* 扩展中心子页组件映射：路由项由导航配置统一生成，新增子页只改 nav + 此映射 */
const PLUGIN_PAGES: Record<string, () => Promise<{ default: Component }>> = {
  mcp: () => import('@modules/mcp/renderer/pages/index.vue'),
  skill: () => import('@modules/skill/renderer/pages/index.vue'),
  builtin: () => import('@modules/plugin/renderer/builtin/pages/index.vue'),
  agent: () => import('@modules/agent/renderer/pages/agents/index.vue')
}

/* 桌面端使用 hash 路由，兼容 file:// 加载 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'chat',
      component: () => import('@modules/chat/renderer/pages/index.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@modules/settings/renderer/pages/index.vue')
    },
    {
      path: '/apps',
      redirect: '/apps/installed'
    },
    {
      path: '/apps/installed',
      name: 'apps-installed',
      component: () => import('@modules/appCenter/renderer/pages/installed.vue')
    },
    {
      path: '/apps/market',
      name: 'apps-market',
      component: () => import('@modules/appCenter/renderer/pages/market.vue')
    },
    {
      path: '/apps/note',
      name: 'apps-note',
      component: () => import('@modules/apps/note/renderer/pages/index.vue')
    },
    {
      path: '/plugin',
      component: () => import('@modules/plugin/renderer/pages/index.vue'),
      redirect: NAV_SECTIONS.plugin.entryPath,
      children: NAV_SECTIONS.plugin.items
        .filter((item) => item.path && PLUGIN_PAGES[item.key])
        .map((item) => ({
          path: item.key,
          name: `plugin-${item.key}`,
          component: PLUGIN_PAGES[item.key]
        }))
    },
    {
      /* 未匹配路由兜底到对话首页 */
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

export default router
