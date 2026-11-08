<script setup lang="ts">
/*
 * 笔记编辑区：CodeMirror 编辑器 + Markdown 预览（编辑 / 分屏 / 预览）。
 * @author xuxueli 2026-11-08
 */
import { computed, ref } from 'vue'
import { CodeEditor, MarkdownBlock } from '@common/renderer/components'
import type { EditorThemeId } from '@common/renderer/components/CodeEditor/editorThemes'
import { t } from '@renderer/shell/i18n'
import { useNoteStore } from '@modules/apps/note/renderer/store'
import { parentDir } from '@modules/apps/note/renderer/utils/path'

/* 编辑器实例能力（CodeEditor defineExpose） */
interface EditorExpose {
  openSearch: () => void
  insertText: (text: string) => void
  scrollToLine: (line: number) => void
}

const props = defineProps<{
  /* 编辑器主题：与文件工具共用同一套主题 */
  theme: EditorThemeId
}>()

const store = useNoteStore()
const editorRef = ref<EditorExpose | null>(null)

/* Markdown 相对图片的基准目录：当前笔记所在目录 */
const baseDir = computed(() => (store.current ? parentDir(store.current.path) : ''))

/* 字号：预览沿正文默认字号 */
const previewClass = computed(() => (store.mode === 'split' ? 'is-split' : ''))

/* 大纲跳转：预览态下切到分屏，保证定位结果可见 */
function jump(line: number): void {
  if (store.mode === 'preview') {
    store.mode = 'split'
  }
  editorRef.value?.scrollToLine(line)
}

/* 工具栏调用：打开查找替换 */
function openSearch(): void {
  editorRef.value?.openSearch()
}

/* 工具栏调用：在光标处插入文本 */
function insertText(text: string): void {
  editorRef.value?.insertText(text)
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

defineExpose({ openSearch, insertText, scrollToLine: jump })
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
        />
        <div
          v-show="store.mode !== 'edit'"
          class="note-preview"
          :class="previewClass"
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
