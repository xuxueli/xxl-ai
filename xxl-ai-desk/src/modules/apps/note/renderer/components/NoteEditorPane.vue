<script setup lang="ts">
/*
 * 笔记编辑区：CodeMirror 编辑器 + Markdown 预览（编辑 / 分屏 / 预览）。
 * @author xuxueli 2026-11-08
 */
import { computed, nextTick, ref, watch } from 'vue'
import { CodeEditor, MarkdownBlock } from '@common/renderer/components'
import type { EditorSelection } from '@common/renderer/components/CodeEditor/types'
import {
  editorThemeVars,
  type EditorThemeId
} from '@common/renderer/components/CodeEditor/editorThemes'
import { t } from '@renderer/shell/i18n'
import { useNoteStore } from '@modules/apps/note/renderer/store'
import { parentDir } from '@modules/apps/note/renderer/utils/path'
import {
  buildDiagram,
  buildTable,
  resolveActiveFormats,
  runMarkdownAction,
  type MarkdownAction,
  type MermaidKind
} from '@modules/apps/note/renderer/utils/markdownCommands'

/* 编辑器实例能力（CodeEditor defineExpose） */
interface EditorExpose {
  toggleSearch: () => void
  insertText: (text: string) => void
  scrollToLine: (line: number) => void
  getScrollRatio: () => number
  getSelection: () => EditorSelection | null
  replaceRange: (
    from: number,
    to: number,
    text: string,
    selectFrom?: number,
    selectTo?: number
  ) => void
}

const props = defineProps<{
  /* 编辑器主题：与文件工具共用同一套主题 */
  theme: EditorThemeId
}>()

const emit = defineEmits<{
  /* 选区变化：同步工具栏激活态 */
  'selection-change': [active: MarkdownAction[]]
}>()

const store = useNoteStore()
const editorRef = ref<EditorExpose | null>(null)
/* 预览滚动容器：与编辑器垂直滚动联动 */
const previewRef = ref<HTMLElement | null>(null)

/* Markdown 相对图片的基准目录：当前笔记所在目录 */
const baseDir = computed(() => (store.current ? parentDir(store.current.path) : ''))

/* 字号：预览沿正文默认字号 */
const previewClass = computed(() => (store.mode === 'split' ? 'is-split' : ''))

/* 预览配色：跟随编辑器主题，不随应用皮肤变化 */
const previewStyle = computed(() => editorThemeVars(props.theme))

/* 大纲跳转后的联动抑制截止时间：避免比例联动覆盖标题精确位置 */
let ignoreScrollSyncUntil = 0

/* 按滚动比例定位预览：编辑器与预览高度不同，用比例近似章节位置 */
function applyPreviewRatio(ratio: number): void {
  const preview = previewRef.value
  if (!preview) {
    return
  }
  const max = preview.scrollHeight - preview.clientHeight
  preview.scrollTop = max > 0 ? max * ratio : 0
}

/* 编辑器滚动：分屏时联动预览 */
function onEditorScroll(ratio: number): void {
  if (store.mode !== 'split' || Date.now() < ignoreScrollSyncUntil) {
    return
  }
  applyPreviewRatio(ratio)
}

/* 在预览中定位标题：按层级 + 文本匹配同名标题的出现序号，匹配不到时退回标题顺序索引 */
function findPreviewHeading(line: number): HTMLElement | null {
  const preview = previewRef.value
  if (!preview) {
    return null
  }
  const index = store.outline.findIndex((item) => item.line === line)
  if (index < 0) {
    return null
  }
  const item = store.outline[index]
  const headings = Array.from(
    preview.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
  )
  const matched = headings.filter(
    (heading) =>
      Number(heading.tagName.slice(1)) === item.level &&
      (heading.textContent ?? '').trim() === item.text
  )
  /* 同名标题按在正文中的出现顺序对应，避免重复标题全部定位到第一处 */
  const occurrence = store.outline
    .slice(0, index)
    .filter((entry) => entry.level === item.level && entry.text === item.text).length
  return matched[occurrence] ?? headings[index] ?? null
}

/* 预览滚动到指定行对应的标题，保留少量顶部留白 */
function scrollPreviewToLine(line: number): void {
  const preview = previewRef.value
  const heading = findPreviewHeading(line)
  if (!preview || !heading) {
    return
  }
  const offset = heading.getBoundingClientRect().top - preview.getBoundingClientRect().top
  preview.scrollTop = Math.max(0, preview.scrollTop + offset - 12)
}

/* 大纲跳转：编辑与预览同时定位（预览态先切到分屏，避免定位时不可见） */
async function jump(line: number): Promise<void> {
  if (store.mode === 'preview') {
    store.mode = 'split'
  }
  await nextTick()
  /* 编辑器定位会触发滚动事件，短暂关闭比例联动以保证预览落在同一标题 */
  ignoreScrollSyncUntil = Date.now() + 200
  editorRef.value?.scrollToLine(line)
  scrollPreviewToLine(line)
}

/* 切换到分屏时，让预览对齐编辑器当前滚动位置 */
watch(
  () => store.mode,
  async (mode) => {
    if (mode !== 'split') {
      return
    }
    await nextTick()
    applyPreviewRatio(editorRef.value?.getScrollRatio() ?? 0)
  }
)

/* 工具栏调用：打开 / 关闭查找替换 */
function toggleSearch(): void {
  editorRef.value?.toggleSearch()
}

/* 工具栏调用：在光标处插入文本 */
function insertText(text: string): void {
  editorRef.value?.insertText(text)
}

/* 选区变化：向上同步激活格式与选中文本 */
function onSelectionChange(selection: EditorSelection | null): void {
  emit('selection-change', selection ? resolveActiveFormats(selection) : [])
}

/* 应用格式：预览态自动切回编辑，保证结果可见 */
function applyFormat(action: MarkdownAction): void {
  const selection = editorRef.value?.getSelection()
  if (!selection) {
    return
  }
  if (store.mode === 'preview') {
    store.mode = 'edit'
  }
  const command = runMarkdownAction(action, selection)
  if (command) {
    editorRef.value?.replaceRange(
      command.from,
      command.to,
      command.text,
      command.selectFrom,
      command.selectTo
    )
  }
}

/* 插入链接 / 表格 / 图表由工具栏触发 */
function insertTable(rows: number, cols: number): void {
  const selection = editorRef.value?.getSelection()
  if (!selection) {
    return
  }
  const command = buildTable(selection, rows, cols)
  editorRef.value?.replaceRange(
    command.from,
    command.to,
    command.text,
    command.selectFrom,
    command.selectTo
  )
}

/* 插入指定类型的 Mermaid 图表 */
function insertDiagram(kind: MermaidKind): void {
  const selection = editorRef.value?.getSelection()
  if (!selection) {
    return
  }
  if (store.mode === 'preview') {
    store.mode = 'split'
  }
  const command = buildDiagram(selection, kind)
  editorRef.value?.replaceRange(
    command.from,
    command.to,
    command.text,
    command.selectFrom,
    command.selectTo
  )
}

/* 粘贴图片：保存到 resource/image 并插入 Markdown */
async function onPaste(event: ClipboardEvent): Promise<void> {
  if (!store.current) {
    return
  }
  const items = event.clipboardData?.items
  if (!items) {
    return
  }
  const imageItem = Array.from(items).find(
    (item) => item.kind === 'file' && item.type.startsWith('image/')
  )
  if (!imageItem) {
    return
  }
  const file = imageItem.getAsFile()
  if (!file) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  const extension = (file.type.split('/')[1] || 'png').split('+')[0]
  const markdown = await store.saveImageBytes(new Uint8Array(await file.arrayBuffer()), extension)
  if (markdown) {
    editorRef.value?.insertText(`\n${markdown}\n`)
  }
}

defineExpose({ toggleSearch, insertText, scrollToLine: jump, applyFormat, insertTable, insertDiagram })
</script>

<template>
  <div class="note-editor-pane" @paste.capture="onPaste">
    <template v-if="store.current">
      <div class="note-content">
        <CodeEditor
          v-show="store.mode !== 'preview'"
          :key="store.current.path"
          ref="editorRef"
          v-model="store.draft"
          :file-name="store.currentName || 'note.md'"
          :theme="props.theme"
          wrap
          @save="store.save"
          @scroll="onEditorScroll"
          @selection-change="onSelectionChange"
        />
        <div
          v-show="store.mode !== 'edit'"
          ref="previewRef"
          class="note-preview"
          :class="previewClass"
          :style="previewStyle"
        >
          <MarkdownBlock :content="store.draft" :base-dir="baseDir" />
        </div>
      </div>
    </template>

    <div v-else class="note-empty">
      <el-icon class="note-empty-icon"><Reading /></el-icon>
      <div class="note-empty-title">{{ t('note.emptyNote') }}</div>
      <div class="note-empty-tip">{{ t('note.emptyNoteTip') }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.note-editor-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  background: var(--desk-bg);
}

.note-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

.note-preview {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 18px 24px 40px;
  background: var(--desk-bg);
}

/* 预览容器覆盖了编辑器主题变量，正文需显式取用，否则会沿用 body 上已解析的应用文字色 */
.note-preview :deep(.markdown-body) {
  color: var(--desk-text);
}

/* 分屏时与编辑器之间保留分隔线 */
.note-preview.is-split {
  border-left: 1px solid var(--desk-border);
}

.note-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--desk-text-tertiary);
  text-align: center;
}

.note-empty-icon {
  font-size: 34px;
  color: var(--desk-text-tertiary);
}

.note-empty-title {
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-md);
}

.note-empty-tip {
  font-size: var(--desk-font-sm);
}
</style>
