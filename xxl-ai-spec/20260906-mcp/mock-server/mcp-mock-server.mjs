#!/usr/bin/env node
/**
 * 本地 MCP 模拟服务（Streamable HTTP / SSE 双模式，零依赖）
 *
 * 用途：xxl_ai_mcp 种子数据（本地时钟服务、天气查询服务、计算器、日志信息查询）
 * 的「连接测试」与 Agent 工具调用联调，保证本机一定能跑通，不依赖外网。
 *
 * 协议实现对照官方 Java MCP SDK（io.modelcontextprotocol.sdk:mcp:2.0.1）：
 *  - http 模式：客户端先 GET（期望 405 → 进入请求/响应模式），随后 POST JSON-RPC；
 *    服务端对 GET 返回 405、对 POST 直接返回 application/json 响应体。
 *  - sse 模式：客户端 GET /sse 开流，服务端发 endpoint 事件（/messages?sessionId=xxx），
 *    客户端 POST /messages?sessionId=xxx，服务端以 SSE message 事件回推结果并回 202。
 *
 * 用法：
 *   node mcp-mock-server.mjs [port...]
 *   # 缺省启动 19001-19004（对应 doc/db/tables_xxl_ai.sql 的初始化种子）
 *
 * 端口与案例：
 *   19001 Streamable HTTP - 本地时钟服务  get_current_time
 *   19002 SSE             - 天气查询服务  get_weather
 *   19003 Streamable HTTP - 计算器        calculator
 *   19004 SSE             - 日志信息查询  query_logs
 *
 * @author xxl-ai 2026-09-06
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

/* 支持的 MCP 协议版本（按客户端请求版本回显） */
const SUPPORTED_VERSIONS = new Set(['2024-11-05', '2025-03-26', '2025-06-18', '2025-03-27']);

/* SSE 链接表：sessionId -> 客户端 GET 流 */
const sseSessions = new Map();

/* 可用工具清单（每个端口一个，便于区分不同服务） */
const TOOLS = {
  get_current_time: { description: '获取服务器当前时间(ISO 8601)', inputSchema: { type: 'object', properties: {} } },
  get_weather: {
    description: '查询指定城市当前天气',
    inputSchema: {
      type: 'object',
      properties: { city: { type: 'string', description: '城市名，如 北京' } },
      required: ['city'],
    },
  },
  calculator: {
    description: '四则运算计算器，表达式如 1+2*3',
    inputSchema: { type: 'object', properties: { expression: { type: 'string', description: '算术表达式' } }, required: ['expression'] },
  },
  query_logs: {
    description: '查询应用最近运行日志',
    inputSchema: { type: 'object', properties: { keyword: { type: 'string', description: '关键字过滤' } } },
  },
};

/* 服务定义：端口 -> 传输模式 / 名称 / 工具 */
const SERVERS = {
  19001: { transport: 'http', name: '本地时钟服务', instructions: '本地时钟服务（Streamable HTTP），提供 get_current_time 工具', tools: ['get_current_time'] },
  19002: { transport: 'sse', name: '天气查询服务', instructions: '天气查询服务（SSE），提供 get_weather 工具', tools: ['get_weather'] },
  19003: { transport: 'http', name: '计算器', instructions: '计算器服务（Streamable HTTP），提供 calculator 工具', tools: ['calculator'] },
  19004: { transport: 'sse', name: '日志信息查询', instructions: '日志信息查询（SSE），提供 query_logs 工具', tools: ['query_logs'] },
};

/* 工具调用实现：返回文本结果 */
function callToolImpl(toolName, args) {
  switch (toolName) {
    case 'get_current_time':
      return '当前时间: ' + new Date().toISOString();
    case 'get_weather':
      return '【' + (args?.city ?? '未知城市') + '】晴，27℃，东北风2级，湿度 45%';
    case 'calculator': {
      const expr = String(args?.expression ?? '').trim();
      if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
        return '表达式不合法（仅支持数字与 +-*/()）';
      }
      try {
        return '计算结果: ' + expr + ' = ' + Function(`"use strict"; return (${expr});`)();
      } catch {
        return '表达式计算失败: ' + expr;
      }
    }
    case 'query_logs':
      return '2026-09-06 10:00:00 [INFO] 服务启动成功\n2026-09-06 10:01:12 [INFO] MCP tools/list 调用正常\n2026-09-06 10:02:33 [WARN] 连接测试频率较高，请留意';
    default:
      return '未知工具: ' + toolName;
  }
}

/**
 * JSON-RPC 分发：统一处理 initialize / notifications/initialized / ping / tools/list / tools/call
 * 返回响应体（含 jsonrpc/id）；通知类返回 null（仅回 HTTP 202）
 */
function dispatch(message, server) {
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
        serverInfo: { name: server.name, version: '1.0.0' },
        instructions: server.instructions,
      },
    };
  }
  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }
  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: server.tools.map((name) => ({ name, description: TOOLS[name]?.description, inputSchema: TOOLS[name]?.inputSchema })) },
    };
  }
  if (method === 'tools/call') {
    const name = message.params?.name;
    const resultText = callToolImpl(name, message.params?.arguments);
    return {
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: resultText }] },
    };
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } };
}

/* ---------- Streamable HTTP 模式 ---------- */

/**
 * http 传输处理：GET 返回 405（告知客户端进入请求/响应模式）；POST 直接回 application/json
 */
function handleHttpRequest(server, req, res) {
  if (req.method === 'GET') {
    res.writeHead(405, { 'Allow': 'POST' });
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Allow': 'POST' });
    res.end();
    return;
  }
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    let msg;
    try {
      msg = JSON.parse(raw || '{}');
    } catch {
      jsonRespond(res, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
      return;
    }
    const resp = dispatch(msg, server);
    if (resp == null) {
      res.writeHead(202);
      res.end();
      return;
    }
    jsonRespond(res, resp, 200);
  });
}

/* ---------- SSE 模式 ---------- */

/**
 * sse 传输处理：
 *  - GET 开流：响应 text/event-stream，先发 endpoint 事件（/messages?sessionId=xxx）
 *  - POST /messages：处理 JSON-RPC，回 202，并把结果以 SSE message 事件回推该 session 的 GET 流
 */
function handleSseRequest(server, req, res) {
  if (req.method === 'GET') {
    const sessionId = randomUUID();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);
    sseSessions.set(sessionId, res);
    req.on('close', () => sseSessions.delete(sessionId));
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Allow': 'GET, POST' });
    res.end();
    return;
  }
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    let msg;
    try {
      msg = JSON.parse(raw || '{}');
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const resp = dispatch(msg, server);
    const sessionId = new URL(req.url, 'http://localhost').searchParams.get('sessionId');
    const out = sessionId ? sseSessions.get(sessionId) : null;
    res.writeHead(202);
    res.end();
    if (resp != null && out && !out.writableEnded) {
      out.write(`event: message\ndata: ${JSON.stringify(resp)}\n\n`);
    }
  });
}

/* 通用 JSON 响应 */
function jsonRespond(res, obj, status) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

/* ---------- 启动 ---------- */

let ports = process.argv.slice(2).map(Number);
if (ports.length === 0) {
  ports = Object.keys(SERVERS).map(Number);
}
for (const port of ports) {
  const server = SERVERS[port];
  if (!server) {
    console.error(`未配置端口 ${port}，支持的端口: ${Object.keys(SERVERS).join(', ')}`);
    process.exit(1);
  }
  createServer((req, res) => (server.transport === 'sse' ? handleSseRequest(server, req, res) : handleHttpRequest(server, req, res)))
    .listen(port, '0.0.0.0', () => {
      console.log(`[${server.name}] ${server.transport.toUpperCase()} 已监听 :${port}  http://127.0.0.1:${port}`);
    });
}