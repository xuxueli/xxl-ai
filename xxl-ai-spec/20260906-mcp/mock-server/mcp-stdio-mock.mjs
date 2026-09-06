#!/usr/bin/env node
/**
 * 本地 MCP 模拟服务（stdio 子进程，零依赖）
 *
 * 用途：xxl_ai_mcp 表 type=2（stdio）的「连接测试」与 Agent 工具调用联调。
 * 协议：与官方 Java MCP SDK（StdioClientTransport）一致 —— stdin 逐行读 JSON-RPC，
 * stdout 逐行回写响应（偶发通知不回复），日志一律走 stderr，避免污染协议流。
 *
 * 用法：
 *   node mcp-stdio-mock.mjs system    # 用例：系统信息查询
 *   node mcp-stdio-mock.mjs random    # 用例：随机数生成
 *
 * 对应 xxl_ai_mcp 种子数据 config 形如：
 *   {"transport":"stdio","command":"node","args":["<仓库绝对路径>/mock-server/mcp-stdio-mock.mjs","system"],"env":{}}
 *
 * @author xxl-ai 2026-09-06
 */
import { createInterface } from 'node:readline';
import { hostname, platform, arch, totalmem, freemem, cpus } from 'node:os';

/* 用例定义：名称 / 说明 / 工具 */
const CASES = {
  system: {
    name: '系统信息查询',
    instructions: '系统信息查询（stdio），提供 get_system_info 工具',
    tools: ['get_system_info'],
  },
  random: {
    name: '随机数生成',
    instructions: '随机数生成（stdio），提供 random_number 工具',
    tools: ['random_number'],
  },
};
const CASE = process.argv[2] || 'system';
const runner = CASES[CASE];
if (!runner) {
  console.error('未知用例: ' + CASE + '，支持: ' + Object.keys(CASES).join(', '));
  process.exit(1);
}

/* 支持的 MCP 协议版本（按客户端请求版本回显） */
const SUPPORTED_VERSIONS = new Set(['2024-11-05', '2025-03-26', '2025-06-18', '2025-03-27']);

/**
 * 工具调用实现：返回文本结果
 */
function callToolImpl(toolName, args) {
  if (toolName === 'get_system_info') {
    const memTotal = Math.round(totalmem() / 1024 / 1024);
    const memFree = Math.round(freemem() / 1024 / 1024);
    return `平台: ${platform()} ${arch()}，主机: ${hostname()}，Node: ${process.version}，内核: ${
      cpus()[0]?.model ?? 'unknown'
    }，内存: ${memFree}MB / ${memTotal}MB`;
  }
  if (toolName === 'random_number') {
    const min = Number(args?.min ?? 1);
    const max = Number(args?.max ?? 100);
    const value = Math.floor(Math.random() * (max - min + 1)) + min;
    return `随机数: ${value}（范围 ${min}~${max}）`;
  }
  return '未知工具: ' + toolName;
}

/**
 * JSON-RPC 分发：与 mcp-mock-server.mjs 保持一致（initialize / ping / tools/list / tools/call）
 * 通知类返回 null（stdio 下不回复，避免干扰客户端解析）
 */
function dispatch(message) {
  const method = message?.method;
  const id = message?.id;
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null;
  }
  if (method === 'initialize') {
    const requested = message.params?.protocolVersion;
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: SUPPORTED_VERSIONS.has(requested) ? requested : '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: runner.name, version: '1.0.0' },
        instructions: runner.instructions,
      },
    };
  }
  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }
  if (method === 'tools/list') {
    const schema = { description: '', inputSchema: { type: 'object', properties: {} } };
    const desc = {
      get_system_info: '获取本机系统信息（平台/主机/内存等）',
      random_number: '生成指定范围随机数，参数 min/max',
    };
    return { jsonrpc: '2.0', id, result: { tools: runner.tools.map((name) => ({ name, description: desc[name], ...schema })) } };
  }
  if (method === 'tools/call') {
    const name = message.params?.name;
    return {
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: callToolImpl(name, message.params?.arguments) }] },
    };
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } };
}

/* stdio 逐行处理：读一行 JSON-RPC，回写一行结果 */
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch (err) {
    console.error('JSON 解析失败: ' + trimmed);
    return;
  }
  const resp = dispatch(msg);
  if (resp != null) {
    process.stdout.write(JSON.stringify(resp) + '\n');
  }
});
rl.on('error', (err) => console.error('[mcp-stdio-mock] 读取 stdin 失败: ' + err.message));