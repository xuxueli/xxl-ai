/**
 * common - 通用工具函数
 *
 * 工具列表：
 *   1. parseTime     - 日期格式化（支持多种输入和自定义模板）
 *   2. tansParams    - 参数序列化（支持嵌套对象展开）
 *   3. getNormalPath - 规范化路径（去除重复/末尾斜杠）
 *   4. blobValidate  - 验证 blob 是否为合法文件数据
 *
 * 用法：
 *   import { parseTime, getNormalPath } from '@/utils/common'
 *   parseTime(new Date(), '{y}-{m}-{d}')  // 日期格式化
 */

// ==================== 日期 / 时间 ====================

/**
 * 日期格式化
 *
 * @param time    - Date 对象 / 时间戳 / ISO 字符串
 * @param pattern - 模板，默认 '{y}-{m}-{d} {h}:{i}:{s}'
 *   占位符：{y}年 {m}月 {d}日 {h}时 {i}分 {s}秒
 * @returns 格式化后的日期字符串；无有效输入时返回 null
 *
 * 示例：
 *   parseTime('2024-01-15', '{y}/{m}/{d}')   // '2024/01/15'
 *   parseTime(1705315200000)                   // '2024-01-15 12:00:00'
 */
export function parseTime(time: Date | number | string, pattern?: string): string | null {
  if (arguments.length === 0 || !time) {
    return null
  }
  const format = pattern || '{y}-{m}-{d} {h}:{i}:{s}'
  let date: Date
  if (typeof time === 'object') {
    date = time
  } else {
    if (typeof time === 'string' && /^[0-9]+$/.test(time)) {
      time = parseInt(time)
    } else if (typeof time === 'string') {
      time = time
        .replace(new RegExp(/-/gm), '/')
        .replace('T', ' ')
        .replace(new RegExp(/\.[\d]{3}/gm), '')
    }
    if (typeof time === 'number' && time.toString().length === 10) {
      time = time * 1000
    }
    date = new Date(time)
  }
  const formatObj: Record<string, number> = {
    y: date.getFullYear(),
    m: date.getMonth() + 1,
    d: date.getDate(),
    h: date.getHours(),
    i: date.getMinutes(),
    s: date.getSeconds()
  }
  const timeStr = format.replace(/{(y|m|d|h|i|s)+}/g, (result: string, key: string): string => {
    let value: number | string = formatObj[key]
    if (result.length > 0 && value < 10) {
      value = '0' + value
    }
    return String(value || '0')
  })
  return timeStr
}

// ==================== URL / 参数 ====================

/**
 * 参数序列化到 URL 查询字符串（支持嵌套对象与数组）
 *
 * 嵌套对象展开为 key[subKey]=value 格式，数组输出 key[]=v1&key[]=v2（后端 List 参数兼容），
 * 忽略 null/''/undefined。末尾带 &，调用方需自行处理。
 *
 * @param params - 参数对象
 * @returns 序列化结果（末尾带 &）
 *
 * 示例：
 *   tansParams({ a: 1, b: { c: 2 } })  // 'a=1&b[c]=2&'
 *   tansParams({ ids: [1, 2] })        // 'ids[]=1&ids[]=2&'
 */
export function tansParams(params: Record<string, any>): string {
  let result = ''
  for (const propName of Object.keys(params)) {
    const value = params[propName]
    const part = encodeURIComponent(propName) + '='
    if (value !== null && value !== '' && typeof value !== 'undefined') {
      // 数组：输出 key[]=v1&key[]=v2（后端 List 参数兼容）
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item !== null && item !== '' && typeof item !== 'undefined') {
            result += encodeURIComponent(propName + '[]') + '=' + encodeURIComponent(item) + '&'
          }
        })
      } else if (typeof value === 'object') {
        for (const key of Object.keys(value)) {
          if (value[key] !== null && value[key] !== '' && typeof value[key] !== 'undefined') {
            const p = propName + '[' + key + ']'
            const subPart = encodeURIComponent(p) + '='
            result += subPart + encodeURIComponent(value[key]) + '&'
          }
        }
      } else {
        result += part + encodeURIComponent(value) + '&'
      }
    }
  }
  return result
}

/**
 * 规范化路径（去除重复斜杠及末尾斜杠）
 *
 * @param p - 原始路径
 * @returns 规范化后的路径
 *
 * 示例：
 *   getNormalPath('//a//b/')  // '/a/b'
 */
export function getNormalPath(p: string): string {
  if (p.length === 0 || !p || p === 'undefined') {
    return p
  }
  const res = p.replace('//', '/')
  if (res[res.length - 1] === '/') {
    return res.slice(0, res.length - 1)
  }
  return res
}

// ==================== 文件 / Blob ====================

/**
 * 验证 blob 是否为合法文件数据（非 JSON 错误报文）
 *
 * @param data - Blob 数据
 * @returns true 为文件数据，false 为 JSON 错误
 */
export function blobValidate(data: Blob): boolean {
  return data.type !== 'application/json'
}
