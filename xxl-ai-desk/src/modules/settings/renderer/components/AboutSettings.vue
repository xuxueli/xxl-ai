<script setup lang="ts">
/*
 * 设置 - 关于我们：版本信息、检查更新与官方链接。
 * @author xuxueli 2026-10-25
 */
import { useSettingsStore } from '@modules/settings/renderer'
import { t } from '@renderer/shell/i18n'
import logo from '@resources/icon.png'

const settings = useSettingsStore()
</script>

<template>
  <div class="about">
    <div class="about-brand">
      <img class="about-logo" :src="logo" alt="logo" />
      <div class="about-name">{{ t('app.name') }}</div>
    </div>
    <div class="about-list">
      <div class="about-row">
        <span class="about-label">{{ t('settings.version') }}</span>
        <div class="about-version">
          <span class="about-value">{{ settings.version }}</span>
          <el-button size="small" :loading="settings.updateChecking" @click="settings.checkUpdate(true)">
            {{ t('settings.checkUpdate') }}
          </el-button>
        </div>
      </div>
      <div class="about-row">
        <span class="about-label">{{ t('settings.github') }}</span>
        <a
          class="about-link"
          href="https://github.com/xuxueli/xxl-ai"
          target="_blank"
          rel="noreferrer"
        >
          https://github.com/xuxueli/xxl-ai
        </a>
      </div>
      <div class="about-row">
        <span class="about-label">{{ t('settings.docs') }}</span>
        <a
          class="about-link"
          href="https://www.xuxueli.com/xxl-ai/"
          target="_blank"
          rel="noreferrer"
        >
          https://www.xuxueli.com/xxl-ai/
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 关于我们 */
.about {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 640px;
}

.about-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.about-logo {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  object-fit: contain;
  flex-shrink: 0;
  box-shadow: var(--desk-shadow);
}

.about-name {
  font-size: var(--desk-font-lg);
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
}

.about-list {
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  overflow: hidden;
  background: var(--desk-bg-elevated);
}

.about-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  font-size: var(--desk-font-base);
}

.about-row + .about-row {
  border-top: 1px solid var(--desk-border);
}

.about-label {
  color: var(--desk-text-secondary);
  flex-shrink: 0;
}

.about-value {
  color: var(--desk-text);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: var(--desk-font-sm);
}

/* 版本行：版本号与「检查更新」同行展示，保持间距不挤压 */
.about-version {
  display: flex;
  align-items: center;
  gap: 16px;
}

.about-link {
  color: var(--desk-primary);
  text-decoration: none;
  word-break: break-all;
  text-align: right;
}

.about-link:hover {
  text-decoration: underline;
}
</style>
