import { createRouter, createWebHashHistory } from 'vue-router'

/* 桌面端使用 hash 路由，兼容 file:// 加载 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'chat',
      component: () => import('../modules/chat/pages/index.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../modules/settings/pages/index.vue')
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

export default router
