<script setup lang="ts">
/*
 * 设置页：按左侧子菜单分类渲染「常规 / 个性化 / 供应商 / 运行设置 / 项目 / 关于」。
 * 分类内容由 components 下各职责组件承载，本页只负责外壳与 TAB 路由。
 * @author xuxueli 2026-10-25
 */
import { useRoute } from 'vue-router'
import { useSettingsStore } from '@modules/settings/renderer'
import { t } from '@common/renderer/i18n'
import { PageHeading } from '@common/renderer/components'
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
            <div class="settings-pane settings-pane-narrow">
              <PageHeading
                :title="t('settings.general')"
                :description="t('settings.pageTip.general')"
                :inset="false"
              />
              <div class="settings-tab-body"><GeneralSettings /></div>
            </div>
          </el-tab-pane>
          <el-tab-pane :label="t('settings.personalization')" name="personalization">
            <div class="settings-pane settings-pane-narrow">
              <PageHeading
                :title="t('settings.personalization')"
                :description="t('settings.pageTip.personalization')"
                :inset="false"
              />
              <div class="settings-tab-body"><PersonalizationSettings /></div>
            </div>
          </el-tab-pane>
          <el-tab-pane :label="t('settings.providers')" name="providers">
            <PageHeading
              :title="t('settings.providers')"
              :description="t('settings.providerTip')"
              :inset="false"
            />
            <div class="settings-tab-body"><ProviderSettings /></div>
          </el-tab-pane>
          <el-tab-pane :label="t('settings.projects')" name="projects">
            <PageHeading
              :title="t('settings.projects')"
              :description="t('project.settingsTip')"
              :inset="false"
            />
            <div class="settings-tab-body"><ProjectSettings /></div>
          </el-tab-pane>
          <el-tab-pane :label="t('settings.runtimeTab')" name="runtime">
            <div class="settings-pane settings-pane-narrow">
              <PageHeading
                :title="t('settings.runtimeTab')"
                :description="t('settings.pageTip.runtime')"
                :inset="false"
              />
              <div class="settings-tab-body">
                <DataDirSettings class="settings-first" />
                <CommandRuntimeSettings />
                <DeveloperSettings />
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane :label="t('settings.about')" name="about">
            <div class="settings-pane settings-pane-half settings-about-pane">
              <AboutSettings />
            </div>
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
  --el-font-size-base: var(--desk-font-base);
}

/* 供应商编辑抽屉（可能被 teleport 到 body，用 :global 命中），字号与左侧菜单一致 */
:global(.settings-drawer) {
  font-size: var(--desk-font-base);
  --el-font-size-base: var(--desk-font-base);
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

/* 正文与扩展中心一致：占满内容区，仅保留左右内边距 */
.settings-inner {
  box-sizing: border-box;
  width: 100%;
  padding: 0 28px 48px;
}

/* 关于我们无标题区，单独保留顶部留白 */
.settings-about-pane {
  padding-top: 16px;
}

/* 标题区分隔线与正文之间的间距：与任务列表正文保持一致 */
.settings-tab-body {
  padding-top: 16px;
}

/* 运行设置首个区块不再重复绘制顶部分割线 */
.settings-tab-body :deep(.settings-first) {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

/* 保证百分比宽度基于完整正文区域计算 */
.settings-tabs,
.settings-tabs :deep(.el-tabs__content),
.settings-tabs :deep(.el-tab-pane) {
  width: 100%;
}

/* 常规 / 个性化 / 运行设置：与会话正文最大宽度一致，靠左对齐 */
.settings-pane-narrow {
  width: 100%;
  max-width: var(--desk-chat-width);
}

/* 关于我们：软件窗口宽度的 50%，水平居中，窗口较窄时不超过正文区 */
.settings-pane-half {
  width: min(50vw, 100%);
  margin: 0 auto;
}

</style>
