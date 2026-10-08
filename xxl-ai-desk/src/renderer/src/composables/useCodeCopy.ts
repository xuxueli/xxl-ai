import { t } from '../i18n'

/*
 * 代码块「复制」按钮的点击委托：适用于 v-html 渲染的 Markdown 代码块。
 *   - 点击 .code-copy 时复制同一 .code-block 内 <code> 的纯文本；
 *   - 复制成功后按钮短暂切换为「已复制」反馈。
 */

/* 复制反馈持续时间（毫秒） */
const FEEDBACK_MS = 1500

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
  const label = (button.querySelector('.code-copy-text') as HTMLElement | null) ?? button
  const original = label.textContent ?? ''
  label.textContent = t('common.copied')
  button.classList.add('copied')
  window.setTimeout(() => {
    label.textContent = original
    button.classList.remove('copied')
  }, FEEDBACK_MS)
}
