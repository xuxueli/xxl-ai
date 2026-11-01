/**
 * clipboard - 剪贴板工具
 *
 * 优先使用 Clipboard API，不支持或写入失败时降级为 textarea + execCommand。
 */

/**
 * 复制文本到剪贴板
 * @param text 待复制文本
 * @returns 是否复制成功
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (e) {
    return fallbackCopy(text)
  }
}

/**
 * 降级复制：创建隐藏 textarea 后执行 execCommand('copy')
 */
function fallbackCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  return copied
}
