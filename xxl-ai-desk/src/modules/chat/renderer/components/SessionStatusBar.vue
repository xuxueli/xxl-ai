<script setup lang="ts">
/*
 * 会话状态信息条：输入框底部集中展示会话统计、Token 用量与上下文消耗。
 *   - 仅已有会话且存在对应数据时展示；
 *   - 信息条只做装配与布局，指标数据由对话状态派生。
 * @author xuxueli 2026-11-08
 */
import { useChatStore } from '@modules/chat/renderer'
import SessionStats from '@modules/chat/renderer/components/SessionStats.vue'
import TokenUsage from '@modules/chat/renderer/components/TokenUsage.vue'
import ContextUsage from '@modules/chat/renderer/components/ContextUsage.vue'

const chat = useChatStore()
</script>

<template>
  <div
    v-if="chat.currentId && (chat.sessionMetrics || chat.tokenUsage || chat.contextUsage)"
    class="session-status-bar"
  >
    <SessionStats v-if="chat.sessionMetrics" :metrics="chat.sessionMetrics" />
    <TokenUsage v-if="chat.tokenUsage" :usage="chat.tokenUsage" />
    <ContextUsage
      v-if="chat.contextUsage"
      :used="chat.contextUsage.used"
      :window="chat.contextUsage.window"
      :breakdown="chat.contextUsage.breakdown"
    />
  </div>
</template>

<style scoped lang="scss">
/* 信息条沿用输入区底部留白：3 个胶囊并排后比原单环略高 2px，保证点击区域舒展 */
.session-status-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 24px;
  max-width: var(--desk-chat-width);
  margin: 0 auto;
}
</style>
