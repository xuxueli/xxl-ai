<!--
  MarkdownBlock（Markdown 渲染块）
  统一渲染助手回复 / 文件预览 / 技能详情：带结果缓存，并承载代码复制/换行/展开、图片预览与链接外开。
-->
<script setup lang="ts">
import { computed, onBeforeUpdate, onUpdated, ref } from 'vue'
import { ElImageViewer } from 'element-plus'
import { renderMarkdown } from '@common/renderer/components/MarkdownBlock/useMarkdown'
import { onCodeBlockClick, restoreCodeBlockState } from '@common/renderer/components/MarkdownBlock/useCodeBlock'
import { onContentLinkClick } from '@common/renderer/composables/useContentLink'
import { t } from '@renderer/shell/i18n'

const props = defineProps<{
  /* Markdown 原文 */
  content: string
  /* 相对图片路径的基准目录（项目根目录 / 文件所在目录 / 技能目录） */
  baseDir?: string
}>()

/* 外层容器同时承载调用方传入的类名（class/style 手动词合并，避免多根节点丢失属性） */
defineOptions({ inheritAttrs: false })

/* 渲染结果（按内容缓存，内容未变化不重复解析） */
const html = computed(() => renderMarkdown(props.content, props.baseDir))

/* 渲染容器（事件委托与状态恢复的根节点） */
const root = ref<HTMLElement | null>(null)

/* 图片预览态：urls 为当前容器内全部图片，index 为点击项 */
const preview = ref<{ urls: string[]; index: number } | null>(null)

/* 更新前的代码块滚动位置（流式刷新后恢复，避免打断阅读） */
let codeScroll: Array<{ top: number; left: number }> = []

/* 更新前记录代码块滚动位置 */
onBeforeUpdate(() => {
  const blocks = root.value?.querySelectorAll<HTMLElement>('.code-block pre')
  codeScroll = blocks ? Array.from(blocks).map((el) => ({ top: el.scrollTop, left: el.scrollLeft })) : []
})

/* 更新后恢复滚动位置与复制按钮态 */
onUpdated(() => {
  const blocks = root.value?.querySelectorAll<HTMLElement>('.code-block pre')
  if (blocks && codeScroll.length === blocks.length) {
    blocks.forEach((el, index) => {
      el.scrollTop = codeScroll[index].top
      el.scrollLeft = codeScroll[index].left
    })
  }
  if (root.value) {
    restoreCodeBlockState(root.value)
  }
})

/* 打开图片预览：收集容器内全部图片以支持切换 */
function openPreview(image: HTMLImageElement): void {
  const images = Array.from(root.value?.querySelectorAll<HTMLImageElement>('img.md-image') ?? [])
  const urls = images.map((item) => item.src)
  preview.value = { urls, index: Math.max(0, images.indexOf(image)) }
}

/*
 * 内容点击委托：链接 → 系统浏览器；代码块 → 复制/换行/展开；图片 → 预览。
 * 均返回是否已消费点击，避免同一事件重复处理。
 */
function handleClick(event: MouseEvent): void {
  if (onContentLinkClick(event)) {
    return
  }
  if (onCodeBlockClick(event)) {
    return
  }
  const target = event.target
  if (target instanceof HTMLImageElement && target.classList.contains('md-image')) {
    openPreview(target)
  }
}

/* 图片加载失败：替换为文字占位，避免流式长文出现破图空白 */
function handleImageError(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLImageElement) || !target.classList.contains('md-image')) {
    return
  }
  const fallback = document.createElement('span')
  fallback.className = 'md-image-fallback'
  fallback.textContent = target.alt || t('common.imageLoadFailed')
  target.replaceWith(fallback)
}
</script>

<template>
  <div class="markdown-body" v-bind="$attrs">
    <div
      ref="root"
      class="markdown-body-content"
      v-html="html"
      @click="handleClick"
      @error.capture="handleImageError"
    ></div>
    <!-- 图片放大预览：点击遮罩关闭 -->
    <ElImageViewer
      v-if="preview"
      :url-list="preview.urls"
      :initial-index="preview.index"
      hide-on-click-modal
      teleported
      @close="preview = null"
    />
  </div>
</template>
