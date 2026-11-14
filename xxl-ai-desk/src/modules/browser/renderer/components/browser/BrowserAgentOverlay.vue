<script setup lang="ts">
/*
 * 浏览器 Agent 操作可视化：组合常驻光标与动作条。
 *   - 由壳级 BrowserHost 按当前会话挂载，子组件各自读取会话状态；
 *   - 只做组合，不承载状态与业务规则。
 * @author xuxueli 2026-11-15
 */
import BrowserActionBar from './BrowserActionBar.vue'
import BrowserCursorLayer from './BrowserCursorLayer.vue'

defineProps<{ sessionId: string }>()
</script>

<template>
  <BrowserCursorLayer :session-id="sessionId" />
  <BrowserActionBar :session-id="sessionId" />
</template>
