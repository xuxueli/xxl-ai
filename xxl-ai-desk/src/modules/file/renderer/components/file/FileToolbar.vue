<script setup lang="ts">
/*
 * 文件面板工具栏：面包屑 + 保存 / 预览 / 打开所在目录 / 打开方式 / 编辑器主题。
 * 视觉与笔记工具栏保持一致：38px 图标工具条、分组分隔线、无边框按钮。
 * @author xuxueli 2026-10-25
 */
import { t } from '@common/renderer/i18n'
import { DeskTooltip } from '@common/renderer/components'
import { SidebarToggleIcon } from '@common/renderer/components/icons'
import EditorThemeMenu from '@common/renderer/components/CodeEditor/EditorThemeMenu.vue'
import type { EditorThemeId } from '@common/renderer/components/CodeEditor/editorThemes'
import type { OpenWithApp } from '@modules/platform/shared'

defineProps<{
  /* 面包屑分段（项目名 + 相对路径） */
  breadcrumb: string[]
  /* 是否可编辑、是否有未保存修改、是否保存中 */
  editable: boolean
  dirty: boolean
  saving: boolean
  /* 文件树是否收起 */
  treeCollapsed: boolean
  /* 是否可预览、预览是否生效 */
  canPreview: boolean
  showPreview: boolean
  /* 是否展示编辑器主题（代码编辑 / Markdown 预览才需要） */
  showTheme: boolean
  /* 是否有文件 / 项目目录（控制打开按钮可用态） */
  hasFile: boolean
  hasRoot: boolean
  /* 本机可用「打开方式」应用 */
  openApps: OpenWithApp[]
  /* 当前编辑器主题 */
  editorTheme: EditorThemeId
}>()

const emit = defineEmits<{
  save: []
  'toggle-preview': []
  'toggle-tree': []
  reveal: []
  'open-default': []
  'open-command': [command: string]
  'theme-command': [theme: EditorThemeId]
}>()
</script>

<template>
  <div class="desk-toolbar">
    <!-- 左侧：树开关 + 面包屑 -->
    <div class="desk-toolbar-main">
      <!-- 文件树折叠 / 展开：位于目录名左侧，控制整个文件树区域显隐 -->
      <DeskTooltip :content="treeCollapsed ? t('panel.expandTree') : t('panel.collapseTree')">
        <button
          class="desk-toolbar-btn"
          :class="{ active: treeCollapsed }"
          :aria-label="treeCollapsed ? t('panel.expandTree') : t('panel.collapseTree')"
          @click="emit('toggle-tree')"
        >
          <SidebarToggleIcon :collapsed="treeCollapsed" />
        </button>
      </DeskTooltip>
      <span class="desk-toolbar-divider"></span>
      <div class="file-breadcrumb" :title="breadcrumb.join(' / ')">
        <template v-for="(seg, index) in breadcrumb" :key="index">
          <span v-if="index > 0" class="crumb-sep">›</span>
          <span class="crumb" :class="{ current: index === breadcrumb.length - 1 }">{{ seg }}</span>
        </template>
      </div>
    </div>

    <!-- 右侧：编辑动作 | 文件系统 -->
    <div class="desk-toolbar-actions">
      <DeskTooltip v-if="editable" :content="t('panel.saveHint')">
        <button
          class="desk-toolbar-btn"
          :class="{ active: dirty }"
          :disabled="!dirty || saving"
          :aria-label="t('panel.save')"
          @click="emit('save')"
        >
          <el-icon><Finished /></el-icon>
        </button>
      </DeskTooltip>
      <DeskTooltip
        v-if="canPreview"
        :content="showPreview ? t('panel.code') : t('panel.preview')"
      >
        <button
          class="desk-toolbar-btn"
          :class="{ active: showPreview }"
          :aria-label="showPreview ? t('panel.code') : t('panel.preview')"
          @click="emit('toggle-preview')"
        >
          <el-icon><Document v-if="showPreview" /><View v-else /></el-icon>
        </button>
      </DeskTooltip>
      <!-- 编辑器主题：紧邻预览切换，下拉直接切换并持久化在本地 -->
      <EditorThemeMenu
        v-if="showTheme"
        :theme="editorTheme"
        :title="t('panel.editorTheme')"
        @select="emit('theme-command', $event)"
      />

      <span v-if="editable || canPreview || showTheme" class="desk-toolbar-divider"></span>

      <DeskTooltip :content="hasFile ? t('panel.openFolder') : t('panel.openProjectFolder')">
        <button
          class="desk-toolbar-btn"
          :disabled="!hasFile && !hasRoot"
          :aria-label="hasFile ? t('panel.openFolder') : t('panel.openProjectFolder')"
          @click="emit('reveal')"
        >
          <el-icon><FolderOpened /></el-icon>
        </button>
      </DeskTooltip>
      <!-- 打开：左半默认应用直接打开，右半下拉选择打开方式 -->
      <div class="desk-toolbar-btn open-split" :class="{ disabled: !hasFile }">
        <DeskTooltip :content="t('panel.openDefault')">
          <button class="open-split-main" :disabled="!hasFile" @click="emit('open-default')">
            <el-icon><DocumentAdd /></el-icon>
          </button>
        </DeskTooltip>
        <DeskTooltip :content="t('panel.open')">
          <el-dropdown
            trigger="click"
            :disabled="!hasFile"
            @command="(command: string) => emit('open-command', command)"
          >
            <button class="open-split-toggle" :disabled="!hasFile">
              <el-icon class="chevron"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="default">
                  <el-icon><Document /></el-icon>{{ t('panel.openDefault') }}
                </el-dropdown-item>
                <el-dropdown-item
                  v-for="app in openApps"
                  :key="app.path"
                  :command="`app:${app.path}`"
                >
                  <el-icon><Monitor /></el-icon>{{ app.name }}
                </el-dropdown-item>
                <el-dropdown-item command="folder" divided>
                  <el-icon><FolderOpened /></el-icon>{{ t('panel.openFolder') }}
                </el-dropdown-item>
                <el-dropdown-item command="copy" divided>
                  <el-icon><CopyDocument /></el-icon>{{ t('panel.copyPath') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </DeskTooltip>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.file-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
}

.crumb {
  flex-shrink: 0;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crumb.current {
  color: var(--desk-text);
  flex-shrink: 1;
}

.crumb-sep {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
}

/* 打开按钮：左半默认打开 + 右半打开方式下拉，整体保持一个按钮外观 */
.open-split {
  width: auto;
  gap: 0;
  overflow: hidden;
}

.open-split.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 无文件时保持按钮静止，不响应悬浮高亮 */
.open-split.disabled:hover {
  background: transparent;
  color: var(--desk-text-secondary);
}

.open-split-main,
.open-split-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  border: none;
  background: transparent;
  color: inherit;
  font-size: inherit;
  cursor: pointer;
}

.open-split-main {
  padding: 0 4px;
}

/* 右半下拉触发器：与左半用细线分隔，仅展示小箭头 */
.open-split-toggle {
  padding: 0 2px;
  border-left: 1px solid var(--desk-border);
}

.open-split-main:disabled,
.open-split-toggle:disabled {
  cursor: not-allowed;
}

/* 下拉包裹层撑满按钮高度，保证左右两半等高 */
.open-split :deep(.el-dropdown) {
  display: inline-flex;
  height: 100%;
}
</style>
