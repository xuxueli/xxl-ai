<script setup lang="ts">
/*
 * 文件面板工具栏：面包屑 + 保存 / 预览 / 打开所在目录 / 打开方式。
 * @author xuxueli 2026-10-25
 */
import { t } from '@renderer/shell/i18n'
import { EDITOR_THEMES, type EditorThemeId } from '@common/renderer/components/CodeEditor/editorThemes'
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
  <div class="file-toolbar">
    <div class="file-leading">
      <!-- 文件树折叠 / 展开：位于目录名左侧，控制整个文件树区域显隐 -->
      <button
        class="panel-btn tree-toggle"
        :title="treeCollapsed ? t('panel.expandTree') : t('panel.collapseTree')"
        @click="emit('toggle-tree')"
      >
        <el-icon><Expand v-if="treeCollapsed" /><Fold v-else /></el-icon>
      </button>
      <div class="file-breadcrumb">
        <template v-for="(seg, index) in breadcrumb" :key="index">
          <span v-if="index > 0" class="crumb-sep">›</span>
          <span class="crumb" :class="{ current: index === breadcrumb.length - 1 }">{{ seg }}</span>
        </template>
      </div>
    </div>
    <div class="file-actions">
      <!-- 编辑器主题：下拉直接切换，持久化在本地 -->
      <el-dropdown
        trigger="click"
        @command="(command: string) => emit('theme-command', command as EditorThemeId)"
      >
        <button class="panel-btn" :title="t('panel.editorTheme')">
          <el-icon><Brush /></el-icon>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="option in EDITOR_THEMES"
              :key="option.id"
              :command="option.id"
            >
              <div class="theme-option">
                <span :class="{ 'theme-active': option.id === editorTheme }">
                  {{ t(option.labelKey) }}
                </span>
                <el-icon v-if="option.id === editorTheme" class="theme-check">
                  <Check />
                </el-icon>
              </div>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <button
        v-if="editable"
        class="panel-btn"
        :class="{ active: dirty }"
        :disabled="!dirty || saving"
        :title="t('panel.saveHint')"
        @click="emit('save')"
      >
        <el-icon><Finished /></el-icon>
        <span>{{ t('panel.save') }}</span>
      </button>
      <button
        v-if="canPreview"
        class="panel-btn"
        :class="{ active: showPreview }"
        :title="showPreview ? t('panel.code') : t('panel.preview')"
        @click="emit('toggle-preview')"
      >
        <el-icon><Document /></el-icon>
        <span>{{ showPreview ? t('panel.code') : t('panel.preview') }}</span>
      </button>
      <button
        class="panel-btn"
        :disabled="!hasFile && !hasRoot"
        :title="hasFile ? t('panel.openFolder') : t('panel.openProjectFolder')"
        @click="emit('reveal')"
      >
        <el-icon><FolderOpened /></el-icon>
      </button>
      <!-- 打开：左半默认应用直接打开，右半下拉选择打开方式 -->
      <div class="panel-btn open-split" :class="{ disabled: !hasFile }">
        <button
          class="open-split-main"
          :disabled="!hasFile"
          :title="t('panel.openDefault')"
          @click="emit('open-default')"
        >
          <el-icon><DocumentAdd /></el-icon>
          <span>{{ t('panel.open') }}</span>
        </button>
        <el-dropdown
          trigger="click"
          :disabled="!hasFile"
          @command="(command: string) => emit('open-command', command)"
        >
          <button class="open-split-toggle" :disabled="!hasFile" :title="t('panel.open')">
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
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 工具栏：面包屑居左，操作居右 */
.file-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  height: var(--desk-panel-header-height);
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--desk-border);
}

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

/* 左侧：文件树折叠按钮 + 面包屑 */
.file-leading {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.tree-toggle {
  flex-shrink: 0;
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

.file-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* 打开按钮：左半默认打开 + 右半打开方式下拉，整体保持一个按钮外观 */
.open-split {
  gap: 0;
  padding: 0;
  overflow: hidden;
}

.open-split.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 无文件时保持按钮静止，不响应悬浮高亮 */
.open-split.disabled:hover {
  background: var(--desk-bg);
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
  gap: 5px;
  padding: 0 10px;
}

/* 右半下拉触发器：与左半用细线分隔，仅展示箭头 */
.open-split-toggle {
  padding: 0 6px;
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

/* 当前编辑器主题：加粗 + 品牌色 */
.theme-active {
  color: var(--desk-primary);
  font-weight: 600;
}

/* 主题下拉项：名称居左，对勾居右 */
.theme-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  width: 100%;
}

.theme-check {
  color: var(--desk-primary);
}
</style>
