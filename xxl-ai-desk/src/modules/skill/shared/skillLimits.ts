/*
 * 在线安装技能的资源阈值：只保留会产生资源消耗风险的限制。
 *   - 本地目录 / Zip 导入不做体积与数量校验，不在此列；
 *   - 路径穿越 / 符号链接 / Zip Slip 等安全栅栏由各服务独立实现，也不在此列。
 * @author xuxueli 2026-10-31
 */

/* 单技能总体积上限（字节） */
export const SKILL_MAX_BYTES = 100 * 1024 * 1024

/* 单个文件体积上限（字节） */
export const SKILL_MAX_FILE_BYTES = 20 * 1024 * 1024

/* 单个技能文件数上限 */
export const SKILL_MAX_FILES = 5000

/* GitHub 归档压缩包体积上限（字节） */
export const GITHUB_ARCHIVE_MAX_BYTES = 200 * 1024 * 1024

/* GitHub 归档解压后总体积上限（字节） */
export const GITHUB_EXTRACT_MAX_BYTES = 500 * 1024 * 1024

/* GitHub 归档解压后文件数上限 */
export const GITHUB_EXTRACT_MAX_FILES = 20000
