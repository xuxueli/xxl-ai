/*
 * 应用标识：名称与版本统一取自 package.json，避免主进程 / 运行时进程各自硬编码。
 * @author xuxueli 2026-10-25
 */

import pkg from '../../../package.json'

/* 应用展示名（与 electron-builder productName 保持一致） */
export const APP_NAME = 'XXL-AI-Desk'

/* 应用版本号（构建期取自 package.json） */
export const APP_VERSION = pkg.version
