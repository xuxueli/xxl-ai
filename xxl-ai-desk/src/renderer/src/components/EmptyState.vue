<script setup lang="ts">
/* 空态欢迎页：Logo + 标题（项目选择已移至输入框下方、靠左） */
import { t } from '../i18n'
import { useSettingsStore } from '../stores/settings'
import logo from '../assets/favicon.ico'

const settings = useSettingsStore()
</script>

<template>
  <div class="empty-state">
    <img class="empty-logo" :src="logo" alt="logo" />
    <h1 class="empty-title">{{ settings.settings.slogan || t('chat.emptyTitle') }}</h1>
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
  width: 51px;
  height: 51px;
  border-radius: 14px;
  object-fit: contain;
  margin-bottom: 24px;
  box-shadow: var(--desk-shadow);
}

.empty-title {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 10px;
}
</style>
