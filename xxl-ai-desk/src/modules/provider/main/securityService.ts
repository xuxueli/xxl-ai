/*
 * 本地密钥编解码：API Key 统一以 base64 编码后入库。
 * @author xuxueli 2026-10-25
 */

/* 编码敏感字符串（如供应商 API Key）：UTF-8 → base64 */
export function encryptSecret(plain: string): string {
  if (!plain) {
    return ''
  }
  return Buffer.from(plain, 'utf-8').toString('base64')
}

/* 解码敏感字符串：base64 → UTF-8 */
export function decryptSecret(value: string): string {
  if (!value) {
    return ''
  }
  return Buffer.from(value, 'base64').toString('utf-8')
}
