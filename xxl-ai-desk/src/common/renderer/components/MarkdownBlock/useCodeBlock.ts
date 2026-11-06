/*
 * 代码块交互：复制、换行、展开/收起，以及重渲染后的状态恢复。
 * v-html 渲染出的按钮无法绑定 Vue 事件，统一用事件委托；流式刷新会重建 DOM，故复制态按代码内容登记后回填。
 * @author xuxueli 2026-10-31
 */

import { ElMessage } from 'element-plus'
import { t } from '@renderer/shell/i18n'

/* 复制反馈持续时间（毫秒） */
const FEEDBACK_MS = 1500

/* 复制反馈登记：代码原文 → 反馈截止时间戳（DOM 重建后据此恢复按钮态） */
const copyFeedback = new Map<string, number>()

/* 已展开的代码块（按代码原文登记，流式重渲染后恢复展开态） */
const expandedCodes = new Set<string>()

/* 已开启自动换行的代码块（同上，按代码原文登记） */
const wrappedCodes = new Set<string>()

/* 取按钮所在代码块的纯文本 */
function codeOf(button: HTMLElement): string {
  return button.closest('.code-block')?.querySelector('code')?.textContent ?? ''
}

/* 写剪贴板：优先 navigator.clipboard，失败时降级 textarea + execCommand */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* 剪贴板不可用时降级为临时文本域选中复制 */
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    document.body.removeChild(textarea)
    return ok
  }
}

/* 应用「已复制」反馈（按钮仍在文档中才更新） */
function applyCopied(button: HTMLElement): void {
  const label = button.querySelector('.code-copy-text')
  if (label) {
    label.textContent = t('common.copied')
  }
  button.classList.add('copied')
}

/* 到期后还原按钮文案与样式（DOM 已被替换时跳过） */
function scheduleRevert(button: HTMLElement, code: string, expiry: number): void {
  window.setTimeout(() => {
    const latest = copyFeedback.get(code)
    /* 期间再次复制会顺延，仅当到达最新截止时间才还原 */
    if (latest === undefined || latest > Date.now()) {
      return
    }
    copyFeedback.delete(code)
    if (!button.isConnected) {
      return
    }
    button.classList.remove('copied')
    const label = button.querySelector('.code-copy-text')
    if (label) {
      label.textContent = t('common.copy')
    }
  }, Math.max(0, expiry - Date.now()))
}

/* 复制代码块内容并给出按钮内反馈 */
async function copyCode(button: HTMLElement): Promise<void> {
  const code = codeOf(button)
  if (!code) {
    return
  }
  const ok = await writeClipboard(code)
  if (!ok) {
    ElMessage.error(t('common.copyFailed'))
    return
  }
  applyCopied(button)
  /* 登记反馈截止时间，供流式重渲染后恢复（避免被 innerHTML 替换抹掉） */
  const expiry = Date.now() + FEEDBACK_MS
  copyFeedback.set(code, expiry)
  scheduleRevert(button, code, expiry)
}

/* 切换长代码块的展开/收起 */
function toggleExpand(button: HTMLElement): void {
  const block = button.closest('.code-block')
  if (!block) {
    return
  }
  const code = block.querySelector('code')?.textContent ?? ''
  const expanded = block.classList.toggle('is-expanded')
  block.classList.toggle('is-collapsed', !expanded)
  button.setAttribute('aria-expanded', String(expanded))
  button.textContent = expanded ? t('common.collapse') : t('common.expand')
  /* 登记展开态，供重渲染后恢复 */
  if (code) {
    if (expanded) {
      expandedCodes.add(code)
    } else {
      expandedCodes.delete(code)
    }
  }
}

/* 应用已登记的展开态 */
function applyExpanded(block: HTMLElement, code: string): void {
  if (!expandedCodes.has(code)) {
    return
  }
  block.classList.add('is-expanded')
  block.classList.remove('is-collapsed')
  const button = block.querySelector<HTMLElement>('.code-expand')
  if (button) {
    button.setAttribute('aria-expanded', 'true')
    button.textContent = t('common.collapse')
  }
}

/* 切换代码块自动换行：长单行内容不再需要横向拖动 */
function toggleWrap(button: HTMLElement): void {
  const block = button.closest('.code-block')
  if (!block) {
    return
  }
  const code = block.querySelector('code')?.textContent ?? ''
  const wrapped = block.classList.toggle('is-wrapped')
  button.setAttribute('aria-pressed', String(wrapped))
  button.textContent = wrapped ? t('common.noWrap') : t('common.wrap')
  if (code) {
    if (wrapped) {
      wrappedCodes.add(code)
    } else {
      wrappedCodes.delete(code)
    }
  }
}

/* 应用已登记的换行态 */
function applyWrapped(block: HTMLElement, code: string): void {
  if (!wrappedCodes.has(code)) {
    return
  }
  block.classList.add('is-wrapped')
  const button = block.querySelector<HTMLElement>('.code-wrap')
  if (button) {
    button.setAttribute('aria-pressed', 'true')
    button.textContent = t('common.noWrap')
  }
}

/*
 * 代码块点击委托：命中复制/换行/展开按钮时执行并返回 true，交由调用方跳过后继处理。
 */
export function onCodeBlockClick(event: MouseEvent): boolean {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return false
  }
  const copyButton = target.closest('.code-copy') as HTMLElement | null
  if (copyButton) {
    void copyCode(copyButton)
    return true
  }
  const expandButton = target.closest('.code-expand') as HTMLElement | null
  if (expandButton) {
    toggleExpand(expandButton)
    return true
  }
  const wrapButton = target.closest('.code-wrap') as HTMLElement | null
  if (wrapButton) {
    toggleWrap(wrapButton)
    return true
  }
  return false
}

/*
 * 渲染更新后恢复代码块态：复制反馈仍在有效期内则重新标记按钮。
 * 由 MarkdownBlock 在 DOM 更新后调用。
 */
export function restoreCodeBlockState(root: HTMLElement): void {
  const now = Date.now()
  /* 清理已过期的登记，避免长期占用内存 */
  copyFeedback.forEach((expiry, code) => {
    if (expiry <= now) {
      copyFeedback.delete(code)
    }
  })
  root.querySelectorAll<HTMLElement>('.code-block').forEach((block) => {
    const code = block.querySelector('code')?.textContent ?? ''
    if (!code) {
      return
    }
    applyExpanded(block, code)
    applyWrapped(block, code)
    const button = block.querySelector<HTMLElement>('.code-copy')
    const expiry = copyFeedback.get(code)
    if (button && expiry !== undefined) {
      applyCopied(button)
      /* 重渲染后补一次到期还原 */
      scheduleRevert(button, code, expiry)
    }
  })
}
