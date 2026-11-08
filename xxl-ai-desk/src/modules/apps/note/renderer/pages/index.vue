<script setup lang="ts">
/*
 * 笔记应用页：左侧笔记目录 + 工具栏 + 编辑器 / 预览。
 * @author xuxueli 2026-11-08
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  EDITOR_THEME_STORAGE_KEY,
  isEditorThemeId,
  type EditorThemeId
} from '@common/renderer/components/CodeEditor/editorThemes'
import { t } from '@renderer/shell/i18n'
import NoteTree from '@modules/apps/note/renderer/components/NoteTree.vue'
import NoteToolbar from '@modules/apps/note/renderer/components/NoteToolbar.vue'
import NoteEditorPane from '@modules/apps/note/renderer/components/NoteEditorPane.vue'
import { useNoteStore } from '@modules/apps/note/renderer/store'
import { useAppCenterStore } from '@modules/appCenter/renderer'

/* 编辑器实例能力 */
interface EditorExpose {
  openSearch: () => void
  insertText: (text: string) => void
  scrollToLine: (line: number) => void
}

const router = useRouter()
const store = useNoteStore()
const appCenter = useAppCenterStore()
const editorRef = ref<EditorExpose | null>(null)

/* 编辑器主题：与文件工具共用同一存储键 */
function readEditorTheme(): EditorThemeId {
  const stored = localStorage.getItem(EDITOR_THEME_STORAGE_KEY)
  return isEditorThemeId(stored) ? stored : 'auto'
}
const editorTheme = ref<EditorThemeId>(readEditorTheme())

/* 切换主题并持久化 */
function onThemeCommand(theme: EditorThemeId): void {
  editorTheme.value = theme
  try {
    localStorage.setItem(EDITOR_THEME_STORAGE_KEY, theme)
  } catch {
    /* 本地存储不可用时忽略（仅影响恢复） */
  }
}

/* 打开查找替换面板：预览态下切到分屏，保证面板可见 */
function find(): void {
  if (store.mode === 'preview') {
    store.mode = 'split'
  }
  editorRef.value?.openSearch()
}

/* 插入图片：选择文件后写入 Markdown */
async function insertImage(): Promise<void> {
  const markdownList = await store.pickImages()
  if (markdownList.length === 0) {
    return
  }
  editorRef.value?.insertText(markdownList.map((item) => `\n${item}\n`).join(''))
  if (store.mode === 'preview') {
    store.mode = 'split'
  }
  ElMessage.success(t('note.imageInserted'))
}

/* 文章目录跳转 */
function jumpOutline(line: number): void {
  editorRef.value?.scrollToLine(line)
}

/* 搜索快捷键：页面内任意位置按 ⌘/Ctrl+F 打开编辑器查找 */
function onKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) {
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    find()
  }
}

/* 启用状态变化：停用后离开笔记页 */
watch(
  () => appCenter.stateOf('note').enabled,
  (enabled) => {
    if (!enabled) {
      void router.replace('/apps/installed')
    }
  }
)

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  await appCenter.ensureLoaded()
  await store.ensureLoaded()
  const state = appCenter.stateOf('note')
  /* 未安装：先去应用市场安装 */
  if (!state.installed) {
    void router.replace('/apps/market')
    return
  }
  if (!state.enabled) {
    void router.replace('/apps/installed')
    return
  }
  await store.reloadTree()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  /* 离开页面时尽力落盘，避免自动保存定时器被销毁后丢失 */
  void store.save()
})
</script>

<template>
  <div class="note-app">
    <NoteTree v-show="!store.treeCollapsed" />
    <div class="note-main">
      <NoteToolbar
        :editor-theme="editorTheme"
        @find="find"
        @insert-image="insertImage"
        @jump="jumpOutline"
        @theme-command="onThemeCommand"
      />
      <NoteEditorPane ref="editorRef" :theme="editorTheme" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.note-app {
  height: 100%;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  background: var(--desk-bg);
}

.note-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
