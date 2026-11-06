/*
 * 供应商地址与请求标识：主进程服务与 Agent 运行时共用，避免服务层反向依赖运行时实现。
 * @author xuxueli 2026-10-25
 */

/* 对外请求 User-Agent（覆盖上游默认值，统一标识 Desk 客户端） */
export const USER_AGENT = 'XXL-AI-Desk'

/*
 * 归一化供应商 BaseURL：结尾去斜杠；裸地址（无路径前缀，如 Ollama http://host:11434）
 * 自动补 /v1 OpenAI 兼容版本前缀。
 */
export function normalizeBaseUrl(baseUrl: string): string {
  let url = (baseUrl ?? '').trim()
  if (url.endsWith('/')) {
    url = url.slice(0, -1)
  }
  try {
    const path = new URL(url).pathname
    if (!path || path === '/') {
      url = `${url}/v1`
    }
  } catch {
    /* 非法 URL 按原值使用，交由后续请求报错 */
  }
  return url
}
