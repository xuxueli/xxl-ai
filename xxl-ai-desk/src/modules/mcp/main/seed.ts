/*
 * MCP 内置种子：首次初始化写入 3 个常用 MCP（Fetch / Filesystem / Playwright）。
 * @author xuxueli 2026-11-07
 */

import { homedir } from 'os'
import type Database from 'better-sqlite3'

/* 内置 MCP 初始化标记：写入成功后不再重置，避免用户删除后被重新写回 */
const MCP_SEED_KEY = 'seed.mcp'

export function seedMcpServers(db: Database.Database): void {
  const seeded = db.prepare('SELECT 1 FROM desk_setting WHERE key = ?').get(MCP_SEED_KEY)
  if (seeded) {
    return
  }

  const now = new Date().toISOString()
  /* Filesystem 服务限定用户主目录，随安装机器自动适配 */
  const servers = [
    {
      name: 'Fetch MCP Server',
      command: 'uvx',
      args: ['mcp-server-fetch'],
      remark:
        '网页抓取：获取网页内容并转换为 Markdown 返回给 Agent，适合阅读和总结网页。依赖本机可用的 uv/uvx。'
    },
    {
      name: 'Filesystem MCP Server',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', homedir()],
      remark:
        '本地文件：支持读取、写入、编辑、移动与搜索文件，访问范围仅限当前用户主目录，防止越界访问。依赖 Node.js/npx。'
    },
    {
      name: 'Playwright MCP Server',
      command: 'npx',
      args: ['@playwright/mcp@latest', '--headless'],
      remark:
        '浏览器自动化：支持打开网页、点击、填表、截图并读取页面内容，由 Microsoft 官方维护。默认无头模式（不弹出浏览器窗口），移除 --headless 参数即可改为可见窗口。首次运行会下载 Chromium，依赖 Node.js/npx。'
    }
  ]

  const insert = db.prepare(`
    INSERT OR IGNORE INTO desk_mcp
      (name, type, transport, url, headers, command, args, env, cwd, config, remark, health, add_time, update_time)
    VALUES (?, 'local', 'stdio', '', '{}', ?, ?, '{}', '', ?, ?, '', ?, ?)
  `)
  const markSeeded = db.prepare('INSERT OR REPLACE INTO desk_setting (key, value) VALUES (?, ?)')

  db.transaction(() => {
    for (const server of servers) {
      const config = JSON.stringify({
        transport: 'stdio',
        command: server.command,
        args: server.args,
        env: {},
        cwd: ''
      })
      insert.run(
        server.name,
        server.command,
        JSON.stringify(server.args),
        config,
        server.remark,
        now,
        now
      )
    }
    markSeeded.run(MCP_SEED_KEY, now)
  })()
}
