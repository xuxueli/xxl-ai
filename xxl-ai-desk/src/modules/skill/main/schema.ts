/*
 * SKILL 技能表结构：目录内容为权威，本表保存来源等可变状态。
 * @author xuxueli 2026-11-07
 */

import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const skillTable = sqliteTable('desk_skill', {
  id: text('id').primaryKey(), /* 技能目录名 */
  name: text('name').notNull().default(''), /* 技能名（frontmatter） */
  description: text('description').notNull().default(''), /* 技能描述 */
  version: text('version').notNull().default(''), /* 版本（可选） */
  source: text('source', { enum: ['local', 'skillssh', 'github'] })
    .notNull()
    .default('local'), /* local / skillssh / github */
  sourceId: text('source_id').notNull().default(''), /* owner/repo/slug 统一标识 */
  addTime: text('add_time').notNull().default(''),
  updateTime: text('update_time').notNull().default('')
})
