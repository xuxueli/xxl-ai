/*
 * 代码块「复制」按钮的点击委托：适用于 v-html 渲染的 Markdown 代码块。
 *   - 点击 .code-copy 时复制同一 .code-block 内 <code> 的纯文本；
 *   - 复制成功后按钮短暂切换为「已复制」反馈。
 */

import { t } from '../i18n'

/* 复制反馈持续时间（毫秒） */
const FEEDBACK_MS = 1500

/* 代码块复制按钮的点击处理：复制目标代码并给出「已复制」反馈 */
export async function onCodeCopyClick(event: MouseEvent): Promise<void> {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }
  const button = target.closest('.code-copy') as HTMLElement | null
  if (!button) {
    return
  }
  const code = button.closest('.code-block')?.querySelector('code')?.textContent ?? ''
  if (!code) {
    return
  }
  try {
    await navigator.clipboard.writeText(code)
  } catch {
    return
  }
  /* 反馈目标：优先更新按钮内文案节点，回退为按钮本身 */
  const label = (button.querySelector('.code-copy-text') as HTMLElement | null) ?? button
  /* 保存原始文案，反馈结束后还原 */
  const original = label.textContent ?? ''
  label.textContent = t('common.copied')
  button.classList.add('copied')
  window.setTimeout(() => {
    label.textContent = original
    button.classList.remove('copied')
  }, FEEDBACK_MS)
}
