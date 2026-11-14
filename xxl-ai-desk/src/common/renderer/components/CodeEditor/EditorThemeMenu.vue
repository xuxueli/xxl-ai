<script setup lang="ts">
/*
 * 编辑器主题菜单：文件工具与笔记工具栏共用，选择后由调用方持久化。
 * @author xuxueli 2026-11-15
 */
import DeskTooltip from '@common/renderer/components/DeskTooltip/index.vue'
import PaletteIcon from '@common/renderer/components/icons/PaletteIcon.vue'
import { t } from '@common/renderer/i18n'
import {
  EDITOR_THEMES,
  type EditorThemeId
} from '@common/renderer/components/CodeEditor/editorThemes'

defineProps<{
  /* 当前编辑器主题 */
  theme: EditorThemeId
  /* 悬浮提示与无障碍名称 */
  title: string
}>()

const emit = defineEmits<{ select: [theme: EditorThemeId] }>()
</script>

<template>
  <DeskTooltip :content="title">
    <el-dropdown
      trigger="click"
      @command="(command: string) => emit('select', command as EditorThemeId)"
    >
      <button class="desk-toolbar-btn" :aria-label="title">
        <PaletteIcon class="theme-icon" />
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-for="option in EDITOR_THEMES" :key="option.id" :command="option.id">
            <div class="theme-option">
              <span :class="{ 'theme-active': option.id === theme }">{{ t(option.labelKey) }}</span>
              <el-icon v-if="option.id === theme" class="theme-check"><Check /></el-icon>
            </div>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </DeskTooltip>
</template>

<style scoped lang="scss">
/* 自绘图标：与工具栏图标保持同一视觉尺寸 */
.theme-icon {
  width: var(--desk-font-md);
  height: var(--desk-font-md);
}

/* 当前主题：主色 + 加粗 */
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
