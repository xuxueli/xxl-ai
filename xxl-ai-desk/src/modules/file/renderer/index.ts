/*
 * file 模块渲染层公共出口。
 * @author xuxueli 2026-11-07
 */

export { default as FilePanel } from './components/file/FilePanel.vue'
export { createFileExplorerActions } from './store'
export { normalizePath, parentDir } from './utils/path'
