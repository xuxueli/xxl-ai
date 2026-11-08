/*
 * 数据库组合根：聚合各领域模块的建表片段与种子，再交给公共运行时初始化。
 * @author xuxueli 2026-11-07
 */

import { initDatabase } from '@common/main/db'
import { AGENT_DDL } from '@modules/agent/main/ddl'
import { APP_CENTER_DDL } from '@modules/appCenter/main/ddl'
import { seedDefaultAgent } from '@modules/agent/main/seed'
import { CHAT_DDL } from '@modules/chat/main/ddl'
import { DIAGNOSTICS_DDL } from '@modules/diagnostics/main/ddl'
import { MCP_DDL } from '@modules/mcp/main/ddl'
import { seedMcpServers } from '@modules/mcp/main/seed'
import { PROJECT_DDL } from '@modules/project/main/ddl'
import { PROVIDER_DDL } from '@modules/provider/main/ddl'
import { SETTINGS_DDL } from '@modules/settings/main/ddl'
import { SKILL_DDL } from '@modules/skill/main/ddl'

/* 各领域建表片段按依赖顺序拼接 */
const DDL = [PROVIDER_DDL, PROJECT_DDL, CHAT_DDL, SETTINGS_DDL, MCP_DDL, SKILL_DDL, AGENT_DDL, DIAGNOSTICS_DDL, APP_CENTER_DDL].join('\n')

/* 初始化本地数据库（应用就绪后调用） */
export function initDatabaseFromModules(): void {
  initDatabase(DDL, [seedMcpServers, seedDefaultAgent])
}
