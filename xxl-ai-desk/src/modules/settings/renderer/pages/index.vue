<script setup lang="ts">
/*
 * 设置页：按左侧子菜单分类渲染「常规 / 个性化 / 供应商 / 运行设置 / 项目 / 关于」。
 * 分类内容由 components 下各职责组件承载，本页只负责外壳与 TAB 路由。
 * @author xuxueli 2026-10-25
 */
import { useRoute } from 'vue-router'
import { useSettingsStore } from '@modules/settings/renderer'
import { t } from '@renderer/shell/i18n'
import GeneralSettings from '@modules/settings/renderer/components/GeneralSettings.vue'
import DataDirSettings from '@modules/settings/renderer/components/DataDirSettings.vue'
import CommandRuntimeSettings from '@modules/settings/renderer/components/CommandRuntimeSettings.vue'
import DeveloperSettings from '@modules/settings/renderer/components/DeveloperSettings.vue'
import PersonalizationSettings from '@modules/settings/renderer/components/PersonalizationSettings.vue'
import { ProviderSettings } from '@modules/provider/renderer'
import { ProjectSettings } from '@modules/project/renderer'
import AboutSettings from '@modules/settings/renderer/components/AboutSettings.vue'

const route = useRoute()
const settings = useSettingsStore()

/* 支持从对话页「+新建供应商」跳转直达供应商 TAB（选中项由左侧子菜单共享） */
if (typeof route.query.tab === 'string' && route.query.tab) {
  settings.activeTab = route.query.tab
}
</script>

<template>
  <div class="settings-page">
    <el-scrollbar class="settings-body">
      <div class="settings-inner">
        <el-tabs v-model="settings.activeTab" class="settings-tabs">
          <el-tab-pane :label="t('settings.general')" name="general">
            <GeneralSettings />
          </el-tab-pane>
          <el-tab-pane :label="t('settings.personalization')" name="personalization">
            <PersonalizationSettings />
          </el-tab-pane>
          <el-tab-pane :label="t('settings.providers')" name="providers">
            <ProviderSettings />
          </el-tab-pane>
          <el-tab-pane :label="t('settings.runtimeTab')" name="runtime">
            <div class="settings-pane">
              <DataDirSettings />
              <CommandRuntimeSettings />
              <DeveloperSettings />
            </div>
          </el-tab-pane>
          <el-tab-pane :label="t('settings.projects')" name="projects">
            <ProjectSettings />
          </el-tab-pane>
          <el-tab-pane :label="t('settings.about')" name="about">
            <AboutSettings />
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped lang="scss">
.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* 字号与左侧菜单保持一致（14px），统一按钮与主要文案 */
  font-size: var(--desk-font-base);
  --el-font-size-base: 14px;
}

/* 供应商弹窗（可能被 teleport 到 body，用 :global 命中），字号与左侧菜单一致 */
:global(.settings-dialog) {
  font-size: var(--desk-font-base);
  --el-font-size-base: 14px;
}

.settings-body {
  flex: 1;
}

/* 设置分类已移至左侧子菜单：隐藏内嵌 Tabs 头部，仅渲染当前分类内容 */
.settings-tabs :deep(.el-tabs__header) {
  display: none;
}

/* 取消内容区裁剪：主题卡片等元素的选中描边为外发光，默认 overflow:hidden 会裁掉左右 1px */
.settings-tabs :deep(.el-tabs__content) {
  overflow: visible;
}

.settings-inner {
  max-width: 940px;
  margin: 0 auto;
  padding: 28px 32px 48px;
}

/* 独立子菜单首个分区不重复画顶部分隔线 */
.settings-pane > :first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}
</style>
