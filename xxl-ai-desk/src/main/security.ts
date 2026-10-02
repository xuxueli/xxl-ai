import { safeStorage } from 'electron'

/* 本地密钥加解密：优先使用系统钥匙串（safeStorage），不可用时回退明文（仅本地开发） */

const PREFIX = 'enc:v1:'

/* 加密敏感字符串（如供应商 API Key），返回可直接入库的文本 */
export function encryptSecret(plain: string): string {
  if (!plain) {
    return ''
  }
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return PREFIX + safeStorage.encryptString(plain).toString('base64')
    }
  } catch {
    /* 忽略并回退明文 */
  }
  return plain
}

/* 解密敏感字符串，兼容历史明文数据 */
export function decryptSecret(value: string): string {
  if (!value) {
    return ''
  }
  if (!value.startsWith(PREFIX)) {
    return value
  }
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(PREFIX.length), 'base64'))
  } catch {
    return ''
  }
}
