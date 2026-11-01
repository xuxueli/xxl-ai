<!--
  MarkdownView（Markdown 渲染）
  统一渲染助手回复 / 记忆内容 / 对话明细：净化防 XSS，代码高亮 + 复制、公式、表格与远程图片/音视频；
  公开对话页与管理端对话明细共用。
-->
<template>
  <div class="markdown-view" v-html="html" @click="handleCopyCode" @error.capture="handleImageError"></div>
</template>

<script setup lang="ts">
import { t } from '@/i18n'
import modal from '@/utils/modal'
import { copyText } from '@/utils/clipboard'
import { renderMarkdown } from '@/utils/markdown'
import { computed } from 'vue'

const props = defineProps<{ content: string }>()

/** 渲染结果（按内容缓存，流式刷新不重复解析） */
const html = computed(() => renderMarkdown(props.content))

/** 复制代码块：v-html 注入的复制按钮无法绑定 Vue 事件，用事件委托处理 */
async function handleCopyCode(event: MouseEvent) {
  const target = (event.target as HTMLElement | null)?.closest?.('.code-copy')
  if (!target) return
  const codeEl = (target as HTMLElement).closest('.code-block')?.querySelector('code')
  if (!codeEl) return
  await copyText(codeEl.textContent ?? '')
  modal.msgSuccess(t('business.chat.copySuccess'))
}

/** 图片加载失败：替换为文字占位，避免长文出现破图空白 */
function handleImageError(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLImageElement) || !target.classList.contains('md-image')) return
  const fallback = document.createElement('span')
  fallback.className = 'md-image-fallback'
  fallback.textContent = target.alt || t('business.chat.imageLoadFailed')
  target.replaceWith(fallback)
}
</script>

<style scoped>
/* --- 正文排版：统一字号、行高与段间距，提升长文可读性 --- */
.markdown-view {
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.75;
  color: var(--el-text-color-primary);
}

.markdown-view :deep(p) {
  margin: 6px 0;
}

/* --- 标题：逐级递减字号，段前留白大于段后 --- */
.markdown-view :deep(h1),
.markdown-view :deep(h2),
.markdown-view :deep(h3),
.markdown-view :deep(h4),
.markdown-view :deep(h5),
.markdown-view :deep(h6) {
  margin: 14px 0 6px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--el-text-color-primary);
}

.markdown-view :deep(h1) {
  font-size: 20px;
}

.markdown-view :deep(h2) {
  font-size: 18px;
}

.markdown-view :deep(h3) {
  font-size: 16px;
}

.markdown-view :deep(h4) {
  font-size: 15px;
}

.markdown-view :deep(h5),
.markdown-view :deep(h6) {
  font-size: 14px;
  color: var(--el-text-color-regular);
}

/* --- 列表：分层符号 + 嵌套缩进，便于分辨结构 --- */
.markdown-view :deep(ul),
.markdown-view :deep(ol) {
  padding-left: 22px;
  margin: 6px 0;
}

.markdown-view :deep(ul) {
  list-style: disc;
}

.markdown-view :deep(ul ul) {
  list-style: circle;
}

.markdown-view :deep(ul ul ul) {
  list-style: square;
}

.markdown-view :deep(ol ol) {
  list-style: lower-alpha;
}

.markdown-view :deep(li) {
  margin: 3px 0;
}

.markdown-view :deep(li > p) {
  margin: 2px 0;
}

.markdown-view :deep(li > pre),
.markdown-view :deep(li > blockquote) {
  margin: 6px 0;
}

/* --- 引用：左侧强调线 + 浅底，与正文区分 --- */
.markdown-view :deep(blockquote) {
  margin: 8px 0;
  padding: 2px 12px;
  border-left: 3px solid var(--el-color-primary-light-5);
  border-radius: 0 4px 4px 0;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
}

.markdown-view :deep(blockquote > :first-child) {
  margin-top: 4px;
}

.markdown-view :deep(blockquote > :last-child) {
  margin-bottom: 4px;
}

/* --- 链接：内链沿用主色，外链补角标提示新窗口打开 --- */
.markdown-view :deep(a) {
  color: var(--el-color-primary);
  text-decoration: none;
}

.markdown-view :deep(a:hover) {
  text-decoration: underline;
}

.markdown-view :deep(a.md-link-external::after) {
  content: '↗';
  margin-left: 2px;
  font-size: 0.8em;
  color: var(--el-text-color-placeholder);
}

/* --- 行内代码 --- */
.markdown-view :deep(code) {
  padding: 1px 5px;
  border-radius: 3px;
  background-color: var(--el-fill-color-light);
  font-size: 12.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
}

/* --- 代码块：语言标签 + 复制按钮头部 + 高亮正文 --- */
.markdown-view :deep(.code-block) {
  margin: 8px 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  background: #f6f8fa;
}

.markdown-view :deep(.code-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  border-bottom: 1px solid #e4e7ed;
  background: #f6f8fa;
  font-size: 12px;
  color: #57606a;
}

.markdown-view :deep(.code-lang) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
  text-transform: lowercase;
}

.markdown-view :deep(.code-copy) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 12px;
  color: #57606a;
  cursor: pointer;
  user-select: none;
  transition: color 0.2s;
}

.markdown-view :deep(.code-copy:hover) {
  color: var(--el-color-primary);
}

.markdown-view :deep(pre) {
  margin: 0;
  padding: 10px 12px;
  overflow-x: auto;
  background: transparent;
  color: #24292f;
  white-space: pre;
  word-break: normal;
  line-height: 1.6;
  tab-size: 2;
}

.markdown-view :deep(pre code) {
  padding: 0;
  border-radius: 0;
  background-color: transparent;
  color: inherit;
  font-size: 12.5px;
}

/* --- 表格：外层横向滚动，宽表不撑破会话区 --- */
.markdown-view :deep(.md-table-wrap) {
  margin: 8px 0;
  overflow-x: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.markdown-view :deep(table) {
  width: max-content;
  min-width: 100%;
  margin: 0;
  border-collapse: collapse;
  font-size: 13px;
}

.markdown-view :deep(th),
.markdown-view :deep(td) {
  padding: 6px 10px;
  border: 1px solid var(--el-border-color-lighter);
  text-align: start;
}

.markdown-view :deep(th) {
  background-color: var(--el-fill-color-lighter);
  font-weight: 600;
  white-space: nowrap;
}

.markdown-view :deep(tbody tr:nth-child(even)) {
  background-color: var(--el-fill-color-lighter);
}

.markdown-view :deep(hr) {
  margin: 12px 0;
  border: none;
  border-top: 1px solid var(--el-border-color-lighter);
}

/* --- 公式：块级公式可横向滚动，避免宽公式溢出 --- */
.markdown-view :deep(.katex) {
  font-size: 1.05em;
}

.markdown-view :deep(.katex-display) {
  margin: 8px 0;
  padding: 2px 0;
  overflow-x: auto;
  overflow-y: hidden;
}

/* --- 图片 / 音视频：自适应容器，媒体可点击播放 --- */
.markdown-view :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  vertical-align: middle;
}

.markdown-view :deep(.md-image) {
  max-height: 420px;
  object-fit: contain;
}

.markdown-view :deep(.md-image-fallback) {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

.markdown-view :deep(video),
.markdown-view :deep(.md-video) {
  display: block;
  max-width: 100%;
  max-height: 480px;
  margin: 8px 0;
  border-radius: 6px;
  background: #000;
}

.markdown-view :deep(audio),
.markdown-view :deep(.md-audio) {
  display: block;
  width: min(520px, 100%);
  max-width: 100%;
  margin: 8px 0;
  border-radius: 6px;
}

/* 任务列表复选框与文字对齐 */
.markdown-view :deep(li > input[type='checkbox']) {
  margin: 0 6px 0 -18px;
  vertical-align: middle;
  accent-color: var(--el-color-primary);
}
</style>
