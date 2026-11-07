/*
 * mcp 模块主进程公共出口。
 * @author xuxueli 2026-11-07
 */

export { browseCategoryMcpSo, browseMcpSo, detailMcpSo, listMcpSoCategories, searchMcpSo } from './community/mcpSoAdapter'
export { buildRuntimeConfig, getMcp, listMcpRuntimeConfigs, saveMcpHealth } from './service'
