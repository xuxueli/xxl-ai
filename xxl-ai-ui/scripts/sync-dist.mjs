/*
 * Description: 前端 dist 产物同步到后端脚本
 *     作用：清理 xxl-ai-api 旧静态资源，并将 xxl-ai-ui/dist 最新构建产物复制到后端静态资源目录，
 *          供后端 `mvn package` 打包为含前端的内嵌 jar；与 `npm run build` 解耦，单独执行。
 *     用法：npm run build 构建产物后，执行 npm run sync:dist 将 dist 同步到后端
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 相对脚本文件定位目录，避免受执行时工作目录影响
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(scriptDir, '../dist')                                    // 前端构建输出目录
const apiStaticDir = path.resolve(scriptDir, '../../xxl-ai-api/src/main/resources/static') // 后端静态资源目录

// 校验构建产物存在，避免误清理后端资源
if (!fs.existsSync(distDir)) {
  console.error(`[xxl-ai] 未找到前端构建产物：${distDir}，请先执行 npm run build`)
  process.exit(1)
}

// 清理后端旧静态资源（含历史 hash 产物），再复制最新构建产物
fs.rmSync(apiStaticDir, { recursive: true, force: true })
fs.cpSync(distDir, apiStaticDir, { recursive: true })
console.log(`[xxl-ai] 前端产物已同步至后端静态资源目录：${apiStaticDir}`)
