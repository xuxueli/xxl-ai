<script setup lang="ts">
/*
 * 笔记工具栏：左侧树开关、居中视图切换、右侧查找 / 插图 / 主题 / 文章目录。
 * @author xuxueli 2026-11-08
 */
import { computed, ref } from 'vue'
import { t } from '@renderer/shell/i18n'
import { EDITOR_THEMES, type EditorThemeId } from '@common/renderer/components/CodeEditor/editorThemes'
import NoteOutline from '@modules/apps/note/renderer/components/NoteOutline.vue'
import { useNoteStore, type NoteMode } from '@modules/apps/note/renderer/store'

const props = defineProps<{
  /* 当前编辑器主题：与文件工具共用同一套主题 */
  editorTheme: EditorThemeId
}>()

const store = useNoteStore()
const emit = defineEmits<{
  find: []
  'insert-image': []
  jump: [line: number]
  'theme-command': [theme: EditorThemeId]
}>()

/* 视图模式双向绑定 */
const mode = computed<NoteMode>({
  get: () => store.mode,
  set: (value) => {
    store.mode = value
  }
})

/* 是否是当前主题 */
function isThemeActive(id: EditorThemeId): boolean {
  return props.editorTheme === id
}

/* 文章目录浮动面板：仅再次点击图标关闭 */
const outlineVisible = ref(false)
const outlinePosition = ref({ top: 0, right: 0 })
const outlineButtonRef = ref<HTMLButtonElement | null>(null)

/* 切换文章目录面板：打开时按图标位置定位，点击其它区域不关闭 */
function toggleOutline(): void {
  if (!store.current) {
    return
  }
  if (outlineVisible.value) {
    outlineVisible.value = false
    return
  }
  const rect = outlineButtonRef.value?.getBoundingClientRect()
  if (!rect) {
    return
  }
  outlinePosition.value = {
    top: rect.bottom + 6,
    right: window.innerWidth - rect.right
  }
  outlineVisible.value = true
}
</script>

<template>
  <div class="note-toolbar">
    <!-- 左侧：笔记树展示 / 隐藏 -->
    <div class="toolbar-side toolbar-left">
      <button
        class="toolbar-btn"
        :title="store.treeCollapsed ? t('note.treeExpand') : t('note.treeCollapse')"
        @click="store.toggleTree"
      >
        <el-icon><Expand v-if="store.treeCollapsed" /><Fold v-else /></el-icon>
      </button>
    </div>

    <!-- 居中：编辑 / 分屏 / 预览 -->
    <el-radio-group v-model="mode" size="small" class="toolbar-mode">
      <el-radio-button value="edit">{{ t('note.modeEdit') }}</el-radio-button>
      <el-radio-button value="split">{{ t('note.modeSplit') }}</el-radio-button>
      <el-radio-button value="preview">{{ t('note.modePreview') }}</el-radio-button>
    </el-radio-group>

    <!-- 右侧：查找 / 插图 / 主题 / 文章目录 -->
    <div class="toolbar-side toolbar-right">
      <button class="toolbar-btn" :title="t('note.findReplace')" @click="emit('find')">
        <el-icon><Search /></el-icon>
      </button>
      <button
        class="toolbar-btn"
        :title="t('note.insertImage')"
        :disabled="!store.current"
        @click="emit('insert-image')"
      >
        <el-icon><PictureRounded /></el-icon>
      </button>

      <!-- 编辑器主题：与文件工具一致，选择后持久化 -->
      <el-dropdown
        trigger="click"
        @command="(command: string) => emit('theme-command', command as EditorThemeId)"
      >
        <button class="toolbar-btn" :title="t('note.theme')">
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
                <span :class="{ 'theme-active': isThemeActive(option.id) }">
                  {{ t(option.labelKey) }}
                </span>
                <el-icon v-if="isThemeActive(option.id)" class="theme-check">
                  <Check />
                </el-icon>
              </div>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- 文章目录：浮动展示当前笔记标题，仅再次点击图标关闭 -->
      <button
        ref="outlineButtonRef"
        class="toolbar-btn"
        :class="{ active: outlineVisible }"
        :title="t('note.outline')"
        :disabled="!store.current"
        @click="toggleOutline"
      >
        <el-icon><Notebook /></el-icon>
      </button>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="outlineVisible"
      class="note-outline-panel"
      :style="{
        top: `${outlinePosition.top}px`,
        right: `${outlinePosition.right}px`
      }"
    >
      <NoteOutline :items="store.outline" @jump="(line: number) => emit('jump', line)" />
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
/* 工具栏：左 / 中 / 右三段，视图切换始终居中 */
.note-toolbar {
  flex-shrink: 0;
  height: 44px;
  padding: 0 10px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--desk-border);
  background: var(--desk-bg-elevated);
}

.toolbar-side {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.toolbar-left {
  justify-self: start;
}

.toolbar-right {
  justify-self: end;
}

.toolbar-mode {
  flex-shrink: 0;
}

.toolbar-btn {
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--desk-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

/* 文章目录打开时保持按钮高亮 */
.toolbar-btn.active {
  background: var(--desk-primary-soft);
  color: var(--desk-primary);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* 文章目录浮动面板：点击其它区域不关闭，仅再次点击图标关闭 */
.note-outline-panel {
  position: fixed;
  z-index: 4000;
  width: 240px;
  padding: 6px;
  border: 1px solid var(--desk-border);
  border-radius: 10px;
  background: var(--desk-bg-elevated);
  box-shadow: var(--desk-shadow);
}

/* 当前主题：加粗 + 品牌色 */
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
