<script setup lang="ts">
import { t } from '../i18n'

/* 空态欢迎页：标题 + 示例建议 */
defineEmits<{ pick: [text: string] }>()

const suggestions = [
  { key: 'chat.suggestion1', icon: 'ChatDotRound' },
  { key: 'chat.suggestion2', icon: 'Calendar' },
  { key: 'chat.suggestion3', icon: 'Cpu' }
]
</script>

<template>
  <div class="empty-state">
    <div class="empty-logo">XXL</div>
    <h1 class="empty-title">{{ t('chat.emptyTitle') }}</h1>
    <p class="empty-subtitle">{{ t('chat.emptySubtitle') }}</p>
    <div class="suggestions">
      <div
        v-for="item in suggestions"
        :key="item.key"
        class="suggestion"
        @click="$emit('pick', t(item.key))"
      >
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ t(item.key) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 24px;
}

.empty-logo {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: var(--desk-primary);
  color: #fff;
  font-weight: 700;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  box-shadow: var(--desk-shadow);
}

.empty-title {
  font-size: 28px;
  font-weight: 600;
  margin: 0 0 10px;
}

.empty-subtitle {
  color: var(--desk-text-secondary);
  margin: 0 0 32px;
  font-size: 15px;
}

.suggestions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  max-width: 780px;
  width: 100%;
}

.suggestion {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius);
  background: var(--desk-bg-elevated);
  color: var(--desk-text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.suggestion:hover {
  border-color: var(--desk-primary);
  color: var(--desk-primary);
  transform: translateY(-1px);
}
</style>
