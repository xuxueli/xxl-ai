<!--
  MarkdownView（Markdown 渲染）
  统一渲染助手回复：净化防 XSS，代码块带「语言标签 / 复制按钮」头部；公开对话页与管理端对话明细共用。
-->
<template>
  <div class="markdown-view" v-html="html" @click="handleCopyCode"></div>
</template>

<script setup lang="ts">
import { t } from '@/i18n'
import { ElMessage } from 'element-plus'
import { Renderer, marked, type Tokens } from 'marked'
import DOMPurify from 'dompurify'
import { computed } from 'vue'

const props = defineProps<{ content: string }>()

/** 转义 HTML 特殊字符（代码块内容/语言标签注入 HTML 前，防止被解释为标签） */
function escapeHtml(text: string): string {
  return (text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Markdown 渲染（净化防 XSS）
 *   - 代码块：浅色主题 + 「语言标签 / 复制按钮」头部；
 *   - 代码块内容经 HTML 转义后注入，避免非法标签内容被 DOMPurify 误删。
 */
function renderMarkdown(text: string): string {
  const renderer = new Renderer()
  renderer.code = ({ text: body, lang }: Tokens.Code) => {
    const language = escapeHtml(lang || '')
    const label = language || 'code'
    const codeHtml = escapeHtml(body)
    return `<div class="code-block"><div class="code-header"><span class="code-lang">${label}</span><span class="code-copy">${t('business.chat.copyCode')}</span></div><pre><code class="language-${language}">${codeHtml}</code></pre></div>`
  }
  const html = marked.parse(text ?? '', { renderer, gfm: true }) as string
  return DOMPurify.sanitize(html)
}

const html = computed(() => renderMarkdown(props.content))

/** 复制文本：优先 navigator.clipboard，降级 textarea 方案 */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch (e) {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

/** 复制代码块：v-html 注入的复制按钮无法绑定 Vue 事件，用事件委托处理 */
async function handleCopyCode(event: MouseEvent) {
  const target = (event.target as HTMLElement | null)?.closest?.('.code-copy')
  if (!target) return
  const codeEl = (target as HTMLElement).closest('.code-block')?.querySelector('code')
  if (!codeEl) return
  await copyText(codeEl.textContent ?? '')
  ElMessage.success(t('business.chat.copySuccess'))
}
</script>

<style scoped>
/* marked 已输出标准块级结构（p/h/ul…），重置父级 pre-wrap，避免块标签间换行被当作空白行 */
.markdown-view {
  white-space: normal;
  word-break: break-word;
  line-height: 1.7;
}

.markdown-view :deep(p) {
  margin: 4px 0;
}

.markdown-view :deep(h1),
.markdown-view :deep(h2),
.markdown-view :deep(h3),
.markdown-view :deep(h4),
.markdown-view :deep(h5),
.markdown-view :deep(h6) {
  margin: 10px 0 6px;
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

.markdown-view :deep(h4),
.markdown-view :deep(h5),
.markdown-view :deep(h6) {
  font-size: 14.5px;
}

.markdown-view :deep(ul),
.markdown-view :deep(ol) {
  padding-left: 22px;
  margin: 4px 0;
}

.markdown-view :deep(blockquote) {
  margin: 6px 0;
  padding: 2px 12px;
  border-left: 3px solid var(--el-border-color);
  border-radius: 0 4px 4px 0;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
}

.markdown-view :deep(code) {
  padding: 1px 5px;
  border-radius: 3px;
  background-color: var(--el-fill-color-light);
  font-size: 12.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
}

/* 代码块：浅色主题 + 语言/复制头部 */
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
  cursor: pointer;
  user-select: none;
  color: #57606a;
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
  line-height: 1.55;
}

.markdown-view :deep(pre code) {
  padding: 0;
  border-radius: 0;
  background-color: transparent;
  color: inherit;
}

.markdown-view :deep(a) {
  color: var(--el-color-primary);
}

.markdown-view :deep(table) {
  width: 100%;
  margin: 8px 0;
  border-collapse: collapse;
  font-size: 13px;
}

.markdown-view :deep(th),
.markdown-view :deep(td) {
  padding: 6px 10px;
  border: 1px solid var(--el-border-color-lighter);
}

.markdown-view :deep(th) {
  background-color: var(--el-fill-color-lighter);
  font-weight: 600;
}

.markdown-view :deep(hr) {
  margin: 10px 0;
  border: none;
  border-top: 1px solid var(--el-border-color-lighter);
}

.markdown-view :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}
</style>
