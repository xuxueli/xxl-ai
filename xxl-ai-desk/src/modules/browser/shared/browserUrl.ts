/*
 * 浏览器地址归一化（渲染层与测试共用）：
 *   - 完整 http/https 直用；
 *   - localhost / IP 补 http；
 *   - 形如域名的补 https；
 *   - 其余（含中文关键词）走搜索引擎。
 */

/* 归一化用户输入的地址或搜索词 */
export function normalizeBrowserUrl(raw: string): string {
  const value = raw.trim()
  if (!value) {
    return ''
  }
  if (/^https?:\/\//i.test(value)) {
    return value
  }
  if (
    /^localhost(:\d+)?(\/.*)?$/i.test(value) ||
    /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(value)
  ) {
    return `http://${value}`
  }
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(value)) {
    return `https://${value}`
  }
  return `https://www.bing.com/search?q=${encodeURIComponent(value)}`
}
