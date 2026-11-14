<script setup lang="ts">
/*
 * 文件查看器：文本编辑（语法高亮 + 行号 + ⌘/Ctrl+S 保存）、Markdown / 图片 / 音视频预览与只读展示。
 * @author xuxueli 2026-10-25
 */
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { ElImageViewer } from 'element-plus'
import { MarkdownBlock } from '@common/renderer/components'
import { toLocalFileUrl } from '@common/renderer/utils/localFileUrl'
import { parentDir } from '@modules/file/renderer/utils/path'
import { t } from '@common/renderer/i18n'
import type { FileContent } from '@modules/file/shared'
import {
  editorThemeVars,
  type EditorThemeId
} from '@common/renderer/components/CodeEditor/editorThemes'

/* 代码编辑器按需加载：未进入编辑态时不加载 CodeMirror */
const CodeEditor = defineAsyncComponent(() => import('@common/renderer/components/CodeEditor/CodeEditor.vue'))

const props = defineProps<{
  root?: string
  file: FileContent | null
  loading: boolean
  error: string
  /* 可编辑：文本文件且未被截断 */
  editable: boolean
  /* 是否预览（预览态且可预览时生效） */
  showPreview: boolean
  isImage: boolean
  isMarkdown: boolean
  isVideo: boolean
  isAudio: boolean
  saving: boolean
  /* 编辑器主题 */
  editorTheme?: EditorThemeId
  /* 同目录图片路径（放大预览内左右切换） */
  imagePaths: string[]
}>()
const draft = defineModel<string>('draft', { required: true })
const emit = defineEmits<{ save: []; 'switch-image': [path: string] }>()

/* Markdown 预览渲染上限：超长文档只渲染前段，避免解析/排版阻塞界面 */
const MAX_MARKDOWN_PREVIEW = 400000

/* 音视频预览地址（经 desk-file 协议流式读取，避免整段文件进内存） */
const mediaUrl = computed(() => {
  if (!props.file || (!props.isVideo && !props.isAudio)) {
    return ''
  }
  return toLocalFileUrl(props.file.path)
})

/* 图片预览地址：同样走本地协议，避免整图 base64 经 IPC 传输并绕过体积上限 */
const imageUrl = computed(() => {
  if (!props.file || !props.isImage) {
    return ''
  }
  return toLocalFileUrl(props.file.path)
})

/* 放大预览的图片列表（同目录图片），用于左右切换 */
const imageUrls = computed(() => {
  if (props.imagePaths.length > 0) {
    return props.imagePaths.map((path) => toLocalFileUrl(path))
  }
  return imageUrl.value ? [imageUrl.value] : []
})
/* 当前图片在列表中的位置（不在列表中时退回首张） */
const imageIndex = computed(() => {
  const index = props.file ? props.imagePaths.indexOf(props.file.path) : -1
  return index >= 0 ? index : 0
})

/* 音视频解码 / 图片加载失败提示（切换文件后复位） */
const mediaError = ref('')
const imageLoadError = ref('')
/* 图片放大预览弹层可见态 */
const imageViewerVisible = ref(false)
/* 图片列表清空（文件被删除 / 目录切换）时关闭弹层，避免残留已失效图片 */
watch(
  () => imageUrls.value.length,
  (length) => {
    if (length === 0) {
      imageViewerVisible.value = false
    }
  }
)
watch(
  () => props.file?.path,
  () => {
    mediaError.value = ''
    imageLoadError.value = ''
  }
)

/* 打开图片放大预览：点击图片弹出遮罩，支持缩放与旋转 */
function openImageViewer(): void {
  if (imageUrl.value && !imageLoadError.value) {
    imageViewerVisible.value = true
  }
}

/* 弹层内左右切换：同步选中文件，关闭弹层时正文与面包屑保持一致 */
function onImageViewerSwitch(index: number): void {
  const path = props.imagePaths[index]
  if (path) {
    emit('switch-image', path)
  }
}

/* Markdown 预览内容：超长文档截断渲染，并给出提示 */
const markdownPreviewTruncated = computed(
  () => props.isMarkdown && (props.file?.content.length ?? 0) > MAX_MARKDOWN_PREVIEW
)
const markdownPreviewContent = computed(() => {
  const content = props.file?.content ?? ''
  return content.length > MAX_MARKDOWN_PREVIEW ? content.slice(0, MAX_MARKDOWN_PREVIEW) : content
})

/* 只读代码行数（编辑态行号由 CodeMirror 提供） */
const lineCount = computed(() => (props.file ? props.file.content.split('\n').length : 0))

/* Markdown 预览配色：与编辑器主题保持一致，不随应用皮肤变化 */
const markdownPreviewStyle = computed(() => editorThemeVars(props.editorTheme))

/* 透传编辑器保存事件 */
function onSave(): void {
  emit('save')
}
</script>

<template>
  <div class="file-viewer">
    <div v-if="!root" class="viewer-empty">{{ t('panel.needProject') }}</div>
    <div v-else-if="loading" class="viewer-empty">
      <el-icon class="spin"><Loading /></el-icon>
    </div>
    <div v-else-if="error" class="viewer-empty error">{{ error }}</div>
    <div v-else-if="!file" class="viewer-empty">{{ t('panel.noSelection') }}</div>
    <template v-else>
      <!-- 文本截断提示：音视频按流读取，不受文本读取上限影响 -->
      <div v-if="file.truncated && !isVideo && !isAudio" class="viewer-banner">
        {{ t('panel.truncated') }}
      </div>
      <div v-else-if="showPreview && markdownPreviewTruncated" class="viewer-banner">
        {{ t('panel.previewTruncated') }}
      </div>
      <div v-if="showPreview && isImage" class="viewer-image">
        <img
          v-if="!imageLoadError"
          :src="imageUrl"
          :alt="file.name"
          :title="t('panel.preview')"
          @error="imageLoadError = t('panel.loadFail')"
          @click="openImageViewer"
        />
        <div v-else class="viewer-empty error">{{ imageLoadError }}</div>
      </div>
      <MarkdownBlock
        v-else-if="showPreview && isMarkdown"
        class="viewer-markdown"
        :style="markdownPreviewStyle"
        :content="markdownPreviewContent"
        :base-dir="parentDir(file.path)"
      />
      <!-- 视频：浏览器原生播放器，经 desk-file 协议流式加载 -->
      <div v-else-if="isVideo" class="viewer-media">
        <video
          v-if="!mediaError"
          :src="mediaUrl"
          controls
          playsinline
          preload="metadata"
          @error="mediaError = t('panel.mediaLoadFail')"
        ></video>
        <div v-else class="viewer-empty error">{{ mediaError }}</div>
      </div>
      <!-- 音频：浏览器原生播放器 -->
      <div v-else-if="isAudio" class="viewer-media">
        <audio
          v-if="!mediaError"
          :src="mediaUrl"
          controls
          preload="metadata"
          @error="mediaError = t('panel.mediaLoadFail')"
        ></audio>
        <div v-else class="viewer-empty error">{{ mediaError }}</div>
      </div>
      <div v-else-if="file.binary" class="viewer-empty">{{ t('panel.binary') }}</div>
      <!-- 可编辑：CodeMirror 6（⌘/Ctrl+S 保存、⌘/Ctrl+F 文件内查找） -->
      <CodeEditor
        v-else-if="editable"
        :key="file.path"
        v-model="draft"
        class="viewer-editor"
        :file-name="file.name"
        :theme="props.editorTheme"
        @save="onSave"
      />
      <!-- 只读（如超大文件被截断）：纯文本展示 -->
      <div v-else class="code-scroll">
        <div class="code-inner">
          <div class="code-gutter">
            <span v-for="n in lineCount" :key="n">{{ n }}</span>
          </div>
          <pre class="code-pre">{{ file.content }}</pre>
        </div>
      </div>
    </template>
    <!-- 图片放大预览：独立于内容分支，切换图片 / 加载态变化时不卸载重挂，避免白屏闪烁 -->
    <ElImageViewer
      v-if="imageViewerVisible && imageUrls.length > 0"
      :url-list="imageUrls"
      :initial-index="imageIndex"
      hide-on-click-modal
      teleported
      @switch="onImageViewerSwitch"
      @close="imageViewerVisible = false"
    />
  </div>
</template>

<style scoped lang="scss">
.file-viewer {
  flex: 1;
  min-width: 150px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--desk-bg);
}

.viewer-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
  text-align: center;
}

.viewer-empty.error {
  color: var(--desk-danger);
}

.viewer-banner {
  flex-shrink: 0;
  padding: 6px 12px;
  background: var(--desk-bg-elevated);
  border-bottom: 1px solid var(--desk-border);
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

/* 代码阅读区：行号固定左侧，横向滚动仅在代码区 */
.code-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--desk-code-bg);
}

.code-inner {
  display: flex;
  align-items: stretch;
  min-width: max-content;
  min-height: 100%;
}

.code-gutter {
  position: sticky;
  left: 0;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 30px;
  padding: 12px 8px 12px 10px;
  background: var(--desk-code-bg);
  border-right: 1px solid var(--desk-code-border);
  text-align: right;
  color: var(--desk-text-tertiary);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  /* 与 CodeEditor 行号栏保持一致：小字号 + 紧凑间距 */
  font-size: var(--desk-font-xs);
  line-height: 22px;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.code-gutter span {
  display: block;
  height: 22px;
}

.code-pre {
  flex: 1;
  margin: 0;
  padding: 12px 18px;
  color: var(--desk-code-text);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: var(--desk-font-sm);
  line-height: 22px;
  white-space: pre;
}

/* 可编辑代码区：CodeMirror 自适应剩余高度（视觉样式见 CodeEditor.vue） */
.viewer-editor {
  flex: 1;
  min-height: 0;
}

/* Markdown 预览：显式 min-height 保证长文档在面板内滚动，而不是把面板撑开 */
.viewer-markdown {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 20px;
  background: var(--desk-bg);
  color: var(--desk-text);
  font-size: var(--desk-font-base);
}

/* 音视频预览：居中展示，视频自适应容器高度 */
.viewer-media {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow: auto;
  background: var(--desk-bg-elevated);
}

.viewer-media video {
  max-width: 100%;
  max-height: 100%;
  border-radius: var(--desk-radius-sm);
  background: var(--desk-media-backdrop);
}

.viewer-media audio {
  width: min(520px, 100%);
}

/* 图片预览：居中展示，自适应容器 */
.viewer-image {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow: auto;
  background: var(--desk-bg-elevated);
}

.viewer-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--desk-radius-sm);
  cursor: zoom-in;
}

.spin {
  animation: viewer-spin 1s linear infinite;
}

@keyframes viewer-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
