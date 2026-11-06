/*
 * Markdown HTML 消毒策略：内容开启了原始 HTML（html: true），所有输出统一经此消毒。
 * 默认拦截脚本/内联框架/文档级标签与 on* 事件；此处补充表单/模板/样式拦截与内联样式白名单。
 * 媒体（video/audio/source/track）放行，但禁用自动播放（autoplay）。
 * @author xuxueli 2026-10-31
 */

import DOMPurify from 'dompurify'

/* 表单 / 模板 / 样式 / 动画类标签：内容不可伪造交互控件或注入全局样式 */
const FORBID_TAGS = [
  'style',
  'form',
  'fieldset',
  'legend',
  'label',
  'select',
  'option',
  'optgroup',
  'textarea',
  'datalist',
  'output',
  'meter',
  'progress',
  'dialog',
  'canvas',
  'map',
  'area',
  'picture',
  'template',
  'slot',
  'shadow',
  'content',
  'element',
  'marquee',
  'blink',
  'animatemotion',
  'animatetransform',
  'animatecolor'
]

/* 外链资源 / 焦点抢占 / DOM 覆盖相关属性（on* 由 DOMPurify 默认剔除） */
const FORBID_ATTR = [
  'srcset',
  'autoplay',
  'controlslist',
  'background',
  'draggable',
  'tabindex',
  'name',
  'usemap',
  'ismap',
  'slot',
  'part',
  'exportparts',
  'popover',
  'popovertarget',
  'popovertargetaction',
  'command',
  'commandfor'
]

/* 表格对齐允许的内联样式（markdown-it 对齐语法输出） */
const SAFE_ALIGN_STYLE = /^\s*text-align\s*:\s*(?:left|right|center|start|end)\s*;?\s*$/i
/* 任何位置都不允许的 CSS 声明：挡住悬浮层/遮挡式劫持 */
const UNSAFE_STYLE = /(?:^|;)\s*(?:position|z-index|inset|pointer-events|cursor|behavior|expression)\s*:/i

const PURIFY_OPTIONS = {
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|desk-file|blob|mailto|tel):|data:(?:image|video|audio)\/|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  /* 懒加载、外链安全属性与交互按钮的无障碍属性需显式放行 */
  ADD_ATTR: ['loading', 'decoding', 'rel', 'target', 'aria-label', 'aria-expanded'],
  /* KaTeX 的 MathML 标注（公式原文，供读屏使用）默认会被剔除，显式放行 */
  ADD_TAGS: ['annotation', 'annotation-xml'],
  FORBID_TAGS,
  FORBID_ATTR
}

/* 节点是否位于 KaTeX 公式子树内（KaTeX 依赖内联样式做排版） */
function insideKatex(node: Element): boolean {
  for (let el: Element | null = node; el; el = el.parentElement) {
    if (el.classList.contains('katex')) {
      return true
    }
  }
  return false
}

/* 内联样式白名单：KaTeX 与表格对齐之外的 style 一律剔除，避免通过样式覆盖应用布局 */
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName !== 'style') {
    return
  }
  /* 危险声明无条件剔除（防伪造 class 混入公式白名单） */
  if (UNSAFE_STYLE.test(data.attrValue)) {
    data.keepAttr = false
    return
  }
  if (insideKatex(node)) {
    return
  }
  const isTableCell = node.nodeName === 'TD' || node.nodeName === 'TH'
  if (isTableCell && SAFE_ALIGN_STYLE.test(data.attrValue)) {
    return
  }
  data.keepAttr = false
})

/* 输入框白名单：仅保留任务列表的只读复选框，其余 input（如伪造的密码框）直接移除 */
DOMPurify.addHook('afterSanitizeElements', (node) => {
  if (node.nodeName !== 'INPUT') {
    return
  }
  const input = node as HTMLInputElement
  if (input.getAttribute('type') === 'checkbox' && input.hasAttribute('disabled')) {
    return
  }
  node.parentNode?.removeChild(node)
})

/* 消毒 Markdown 渲染出的 HTML */
export function sanitizeMarkdown(html: string): string {
  return DOMPurify.sanitize(html, PURIFY_OPTIONS)
}
