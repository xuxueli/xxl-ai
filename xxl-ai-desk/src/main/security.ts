/*
 * 本地密钥编解码：按约定 apiKey 固定以「明文 base64」存储（不做加密）。
 * 历史版本的 safeStorage 密文（enc:v1: 前缀）仍可读出，保证老数据不失效。
 */

import { safeStorage } from 'electron'

/* 历史 safeStorage 密文前缀 */
const LEGACY_PREFIX = 'enc:v1:'

/* 编码敏感字符串（如供应商 API Key）：UTF-8 → base64，可直接入库 */
export function encryptSecret(plain: string): string {
  if (!plain) {
    return ''
  }
  return Buffer.from(plain, 'utf-8').toString('base64')
}

/*
 * 解码敏感字符串：
 *   - enc:v1: 前缀：历史 safeStorage 密文，仍按钥匙串解密（仅在旧数据上生效）；
 *   - 其余：按 base64 解码；若无法无损往返（非本方案编码的历史明文），按原值兼容。
 */
export function decryptSecret(value: string): string {
  if (!value) {
    return ''
  }
  if (value.startsWith(LEGACY_PREFIX)) {
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(LEGACY_PREFIX.length), 'base64'))
    } catch {
      return ''
    }
  }
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf-8')
    if (Buffer.from(decoded, 'utf-8').toString('base64') === value) {
      return decoded
    }
  } catch {
    /* 解析失败按历史明文兼容 */
  }
  return value
}
