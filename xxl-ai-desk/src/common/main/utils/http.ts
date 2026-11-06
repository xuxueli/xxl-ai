/*
 * 带超时的文本请求：社区适配器与远程模型查询共用，统一 UA、超时中断与可读错误。
 * @author xuxueli 2026-10-25
 */

import { USER_AGENT } from '@common/shared/providerUrl'

/* 默认请求超时（毫秒） */
export const DEFAULT_HTTP_TIMEOUT = 15000

/* 请求选项 */
export interface HttpTextOptions {
  /* 附加请求头（会覆盖默认 UA） */
  headers?: Record<string, string>
  /* 超时毫秒数 */
  timeout?: number
  /* Accept 头（默认 JSON + HTML） */
  accept?: string
}

/* 发送 GET 并返回 Response（超时以 AbortError 中断） */
export async function requestWithTimeout(
  url: string,
  options: HttpTextOptions = {}
): Promise<Response> {
  const controller = new AbortController()
  const timeout = options.timeout ?? DEFAULT_HTTP_TIMEOUT
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Accept: options.accept ?? 'application/json,text/html;q=0.9,*/*;q=0.8',
        ...options.headers
      }
    })
  } finally {
    clearTimeout(timer)
  }
}

/* 是否为超时中断（调用方据此给出站点化提示） */
export function isTimeoutError(error: unknown): boolean {
  return (error as Error)?.name === 'AbortError'
}
