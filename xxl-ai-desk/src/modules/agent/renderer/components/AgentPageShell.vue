<script setup lang="ts">
/*
 * Agent 页面外壳：标题 / 说明 + 可滚动正文，供「指令 / 记忆」两个子页复用。
 * @author xuxueli 2026-10-31
 */
import { t } from '@renderer/shell/i18n'

defineProps<{ titleKey: string; tipKey: string; wide?: boolean }>()
</script>

<template>
  <div class="agent-page">
    <div class="agent-page-header">
      <h2 class="agent-page-title">{{ t(titleKey) }}</h2>
      <p class="agent-page-tip">{{ t(tipKey) }}</p>
    </div>
    <el-scrollbar class="agent-page-body">
      <div class="agent-page-inner" :class="{ 'is-wide': wide }">
        <slot></slot>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped lang="scss">
.agent-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--desk-bg);
}

.agent-page-header {
  flex-shrink: 0;
  padding: 18px 28px 14px;
  border-bottom: 1px solid var(--desk-border);
}

.agent-page-title {
  margin: 0;
  font-size: var(--desk-font-lg);
  font-weight: 600;
  color: var(--desk-text);
}

.agent-page-tip {
  margin: 6px 0 0;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
}

.agent-page-body {
  flex: 1;
  min-height: 0;
}

.agent-page-inner {
  max-width: 820px;
  padding: 20px 28px 32px;
}

/* 列表类页面使用更宽的内容区：与「插件中心 → MCP 管理」保持一致的满宽与内边距 */
.agent-page-inner.is-wide {
  max-width: none;
  padding: 16px 28px 32px;
}
</style>
