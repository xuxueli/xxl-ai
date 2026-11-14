<script setup lang="ts">
/*
 * 笔记应用页：左侧笔记目录 + 工具栏 + 编辑器 / 预览。
 * @author xuxueli 2026-11-08
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  EDITOR_THEME_STORAGE_KEY,
  editorThemeVars,
  isEditorThemeId,
  type EditorThemeId
} from '@common/renderer/components/CodeEditor/editorThemes'
import { t } from '@common/renderer/i18n'
import NoteTree from '@modules/apps/note/renderer/components/NoteTree.vue'
import NoteToolbar from '@modules/apps/note/renderer/components/NoteToolbar.vue'
import NoteToolbarIcon from '@modules/apps/note/renderer/components/NoteToolbarIcon.vue'
import NoteEditorPane from '@modules/apps/note/renderer/components/NoteEditorPane.vue'
import NoteOutline from '@modules/apps/note/renderer/components/NoteOutline.vue'
import NoteStatusBar from '@modules/apps/note/renderer/components/NoteStatusBar.vue'
import { useNoteStore } from '@modules/apps/note/renderer/store'
import type { MarkdownAction, MermaidKind } from '@modules/apps/note/renderer/utils/markdownCommands'
import { useAppCenterStore } from '@modules/appCenter/renderer'

/* 编辑器实例能力 */
interface EditorExpose {
  toggleSearch: () => void
  insertText: (text: string) => void
  scrollToLine: (line: number) => void
  applyFormat: (action: MarkdownAction) => void
  insertTable: (rows: number, cols: number) => void
  insertDiagram: (kind: MermaidKind) => void
}

const router = useRouter()
const store = useNoteStore()
const appCenter = useAppCenterStore()
const editorRef = ref<EditorExpose | null>(null)

/* 编辑器选区同步：工具栏激活态 */
const activeFormats = ref<MarkdownAction[]>([])
/* 右侧目录模块展开态 */
const outlineOpen = ref(false)
/* 编辑器顶部可见行：驱动右侧目录高亮当前章节 */
const currentLine = ref(1)

/* 选区变化 */
function onSelectionChange(active: MarkdownAction[]): void {
  activeFormats.value = active
}

/* 编辑器滚动位置变化 */
function onScrollPosition(line: number): void {
  currentLine.value = line
}

/* 工具栏格式命令 */
function applyFormat(action: MarkdownAction): void {
  editorRef.value?.applyFormat(action)
}

/* 工具栏表格 / 图表插入 */
function insertTable(rows: number, cols: number): void {
  editorRef.value?.insertTable(rows, cols)
}

function insertDiagram(kind: MermaidKind): void {
  editorRef.value?.insertDiagram(kind)
}

/* 切换右侧目录模块 */
function toggleOutline(): void {
  if (!store.current) {
    return
  }
  outlineOpen.value = !outlineOpen.value
}

/* 编辑器主题：与文件工具共用同一存储键 */
function readEditorTheme(): EditorThemeId {
  const stored = localStorage.getItem(EDITOR_THEME_STORAGE_KEY)
  return isEditorThemeId(stored) ? stored : 'auto'
}
const editorTheme = ref<EditorThemeId>(readEditorTheme())

/* 右侧目录配色：与编辑器正文同源，背景、文字、边框随编辑器主题切换 */
const outlineStyle = computed(() => editorThemeVars(editorTheme.value))

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
  editorRef.value?.toggleSearch()
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

/* 文章目录跳转：同步高亮目标章节 */
function jumpOutline(line: number): void {
  currentLine.value = line
  editorRef.value?.scrollToLine(line)
}

/* 搜索 / 格式化快捷键：页面内任意位置按 ⌘/Ctrl+ 组合键生效 */
function onKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) {
    return
  }
  if (!(event.metaKey || event.ctrlKey)) {
    return
  }
  /* 工具栏弹层输入框内不拦截（弹层已传送到 body，需单独判断） */
  const target = event.target
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return
  }
  const key = event.key.toLowerCase()
  const code = event.code
  const plain = !event.shiftKey && !event.altKey

  if (key === 'f' && plain) {
    event.preventDefault()
    find()
    return
  }
  if (key === 'k' && plain) {
    event.preventDefault()
    applyFormat('link')
    return
  }
  /* 标题：⌘/Ctrl + 1~6（按物理键位判断，避免布局差异） */
  if (plain && /^Digit[1-6]$/.test(code)) {
    event.preventDefault()
    applyFormat(`h${code.slice(-1)}` as MarkdownAction)
    return
  }
  /* 其余组合键与帮助弹窗中的快捷键表保持一致 */
  const shortcuts: Array<{ shift: boolean; alt: boolean; code: string; action: MarkdownAction }> = [
    { shift: false, alt: false, code: 'KeyB', action: 'bold' },
    { shift: false, alt: false, code: 'KeyI', action: 'italic' },
    { shift: false, alt: false, code: 'KeyE', action: 'inlineCode' },
    { shift: true, alt: false, code: 'KeyX', action: 'strike' },
    { shift: true, alt: false, code: 'KeyQ', action: 'quote' },
    { shift: false, alt: true, code: 'KeyC', action: 'codeBlock' },
    { shift: true, alt: false, code: 'Digit8', action: 'bulletList' },
    { shift: true, alt: false, code: 'Digit7', action: 'orderedList' }
  ]
  const matched = shortcuts.find(
    (item) => item.shift === event.shiftKey && item.alt === event.altKey && item.code === code
  )
  if (matched) {
    event.preventDefault()
    applyFormat(matched.action)
  }
}

/* 当前笔记关闭时同步收起目录模块，并重置章节高亮 */
watch(
  () => store.current,
  (current) => {
    currentLine.value = 1
    if (!current) {
      outlineOpen.value = false
    }
  }
)

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
    <NoteTree />
    <div class="note-main">
      <NoteToolbar
        :editor-theme="editorTheme"
        :active="activeFormats"
        :outline-open="outlineOpen"
        @find="find"
        @insert-image="insertImage"
        @theme-command="onThemeCommand"
        @command="applyFormat"
        @table="insertTable"
        @diagram="insertDiagram"
        @toggle-outline="toggleOutline"
      />
      <div class="note-body">
        <NoteEditorPane
          ref="editorRef"
          :theme="editorTheme"
          @scroll-position="onScrollPosition"
          @selection-change="onSelectionChange"
        />
        <aside v-if="outlineOpen && store.current" class="note-outline-side" :style="outlineStyle">
          <div class="outline-side-head">
            <span class="outline-side-title">{{ t('note.outline') }}</span>
            <button class="outline-side-close" type="button" @click="outlineOpen = false">
              <NoteToolbarIcon name="close" />
            </button>
          </div>
          <div class="outline-side-body">
            <NoteOutline :items="store.outline" :active-line="currentLine" @jump="jumpOutline" />
          </div>
        </aside>
      </div>
      <NoteStatusBar />
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

/* 编辑区 + 右侧目录模块 */
.note-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

/* 目录模块：紧贴右侧，顶部标题栏 + 可滚动目录 */
.note-outline-side {
  flex-shrink: 0;
  width: var(--desk-note-outline-width);
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--desk-border);
  background: var(--desk-bg);
}

.outline-side-head {
  flex-shrink: 0;
  height: var(--desk-panel-header-height);
  padding: 0 8px 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--desk-border);
}

.outline-side-title {
  color: var(--desk-text);
  font-size: var(--desk-font-md);
  font-weight: 600;
}

.outline-side-close {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--desk-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.outline-side-close:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.outline-side-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}
</style>
