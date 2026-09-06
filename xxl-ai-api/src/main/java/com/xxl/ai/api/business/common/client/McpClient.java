package com.xxl.ai.api.business.common.client;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.xxl.ai.api.business.mcp.model.entity.Mcp;
import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.HttpClientSseClientTransport;
import io.modelcontextprotocol.client.transport.HttpClientStreamableHttpTransport;
import io.modelcontextprotocol.client.transport.ServerParameters;
import io.modelcontextprotocol.client.transport.StdioClientTransport;
import io.modelcontextprotocol.json.McpJsonDefaults;
import io.modelcontextprotocol.json.McpJsonMapper;
import io.modelcontextprotocol.spec.McpSchema;
import io.modelcontextprotocol.spec.McpClientTransport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpRequest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * MCP 客户端统一封装（官方 Java MCP SDK）
 *
 * 按 MCP 完整配置格式构建传输层：
 *  - http  ：Streamable HTTP（HttpClientStreamableHttpTransport，JDK HttpClient）
 *  - sse   ：SSE（HttpClientSseClientTransport）
 *  - stdio ：本地进程（StdioClientTransport，ProcessBuilder 子进程）
 * 客户端与服务端连接按「mcpId + config 指纹」缓存复用；tools/list 单独缓存，工具变化推出重建
 *
 * @author xxl-ai 2026-09-06
 */
@Component
public class McpClient {

    private static final Logger logger = LoggerFactory.getLogger(McpClient.class);
    private static final Gson GSON = new Gson();

    /** 客户端缓存（按 mcpId） */
    private final ConcurrentHashMap<Long, CachedClient> clientCache = new ConcurrentHashMap<>();
    /** 工具列表缓存（按 mcpId） */
    private final ConcurrentHashMap<Long, CachedTools> toolsCache = new ConcurrentHashMap<>();
    private final Object lock = new Object();

    /**
     * 移除并关闭指定 MCP 客户端（删除/停用配置时调用，释放子进程与连接线程）
     */
    public void evict(long mcpId) {
        CachedClient cached = clientCache.remove(mcpId);
        toolsCache.remove(mcpId);
        if (cached != null && cached.sync() != null) {
            try {
                cached.sync().closeGracefully();
            } catch (Exception e) {
                logger.warn("MCP 客户端关闭失败, id={}, err={}", mcpId, e.getMessage());
            }
        }
    }

    /**
     * 获取 MCP 服务暴露的工具列表（带缓存，配置变化自动重建）
     */
    public List<McpToolInfo> listTools(Mcp mcp) {
        long fp = fingerprint(mcp);
        CachedTools cached = toolsCache.get(mcp.getId());
        if (cached != null && cached.fingerprint == fp) {
            return cached.tools;
        }
        List<McpToolInfo> tools = new ArrayList<>();
        McpSyncClient sync = getClient(mcp);
        try {
            McpSchema.ListToolsResult result = sync.listTools();
            if (result != null && result.tools() != null) {
                for (McpSchema.Tool tool : result.tools()) {
                    tools.add(new McpToolInfo(mcp.getId(), mcp.getName(),
                            tool.name(), tool.description(), tool.inputSchema()));
                }
            }
        } catch (Exception e) {
            logger.warn("MCP tools/list 失败, id={}, name={}, err={}", mcp.getId(), mcp.getName(), e.getMessage());
        }
        toolsCache.put(mcp.getId(), new CachedTools(fp, tools));
        return tools;
    }

    /**
     * 调用 MCP 工具（阻塞），返回文本结果
     */
    public String callTool(Mcp mcp, String toolName, String argumentsJson) {
        McpSyncClient sync = getClient(mcp);
        Map<String, Object> arguments = parseArguments(argumentsJson);
        synchronized (sync) {
            McpSchema.CallToolRequest request = new McpSchema.CallToolRequest(toolName, arguments);
            McpSchema.CallToolResult result = sync.callTool(request);
            return readText(result);
        }
    }

    /**
     * 连通性测试：initialize + tools/list，返回可用工具数量与耗时
     */
    public McpConnectResult test(Mcp mcp) {
        long start = System.currentTimeMillis();
        McpSyncClient sync = null;
        try {
            McpClientTransport transport = buildTransport(mcp);
            if (transport == null) {
                return McpConnectResult.fail(0, System.currentTimeMillis() - start, "配置不完整（缺少必要参数）");
            }
            sync = io.modelcontextprotocol.client.McpClient.sync(transport)
                    .requestTimeout(Duration.ofSeconds(30))
                    .initializationTimeout(Duration.ofSeconds(15))
                    .build();
            sync.initialize();
            String serverName = null;
            String serverVersion = null;
            McpSchema.Implementation serverInfo = sync.getServerInfo();
            if (serverInfo != null) {
                serverName = serverInfo.name();
                serverVersion = serverInfo.version();
            }
            String instructions = sync.getServerInstructions();
            List<McpToolDetail> tools = new ArrayList<>();
            McpSchema.ListToolsResult listResult = sync.listTools();
            if (listResult != null && listResult.tools() != null) {
                for (McpSchema.Tool tool : listResult.tools()) {
                    tools.add(new McpToolDetail(tool.name(), tool.title(), tool.description()));
                }
            }
            long elapsed = System.currentTimeMillis() - start;
            return McpConnectResult.ok(serverName, serverVersion, instructions, tools, elapsed, "连接成功，发现 " + tools.size() + " 个工具");
        } catch (Exception e) {
            long elapsed = System.currentTimeMillis() - start;
            logger.warn("MCP 连通测试失败, id={}, name={}, err={}", mcp.getId(), mcp.getName(), e.getMessage());
            return McpConnectResult.fail(0, elapsed, String.valueOf(e.getMessage()));
        } finally {
            if (sync != null) {
                try {
                    sync.closeGracefully();
                } catch (Exception ignored) {
                }
            }
        }
    }

    /**
     * 获取（或构建）MCP 客户端：按 mcpId + config 指纹缓存，配置变化重建并关闭旧连接
     */
    private McpSyncClient getClient(Mcp mcp) {
        long fp = fingerprint(mcp);
        CachedClient cached = clientCache.get(mcp.getId());
        if (cached != null && cached.fingerprint == fp) {
            return cached.sync;
        }
        synchronized (lock) {
            cached = clientCache.get(mcp.getId());
            if (cached != null && cached.fingerprint == fp) {
                return cached.sync;
            }
            McpClientTransport transport = buildTransport(mcp);
            if (transport == null) {
                throw new RuntimeException("配置不完整（缺少必要参数）");
            }
            McpSyncClient sync = io.modelcontextprotocol.client.McpClient.sync(transport)
                    .requestTimeout(Duration.ofSeconds(60))
                    .initializationTimeout(Duration.ofSeconds(15))
                    .build();
            sync.initialize();
            if (cached != null && cached.sync != null) {
                try {
                    cached.sync.closeGracefully();
                } catch (Exception ignored) {
                }
            }
            clientCache.put(mcp.getId(), new CachedClient(fp, sync));
            return sync;
        }
    }

    /**
     * 构建传输层：按 config 配置格式（http/sse/stdio）解析
     */
    private McpClientTransport buildTransport(Mcp mcp) {
        McpConfig config = parseConfig(mcp);
        String transport = config.transport;
        try {
            switch (transport) {
                case "stdio":
                    return buildStdioTransport(config);
                case "sse":
                    return buildSseTransport(config);
                default:
                    return buildHttpTransport(config);
            }
        } catch (Exception e) {
            logger.warn("MCP 传输层构建失败, id={}, err={}", mcp.getId(), e.getMessage());
            return null;
        }
    }

    /**
     * Streamable HTTP 传输：url + headers
     */
    private McpClientTransport buildHttpTransport(McpConfig config) {
        if (config.url == null || config.url.isEmpty()) {
            return null;
        }
        HttpClientStreamableHttpTransport.Builder builder = HttpClientStreamableHttpTransport.builder(config.url)
                .customizeClient(clientBuilder -> clientBuilder.connectTimeout(Duration.ofSeconds(10)));
        if (config.headers != null && !config.headers.isEmpty()) {
            builder.httpRequestCustomizer(headerCustomizer(config.headers));
        }
        return builder.build();
    }

    /**
     * SSE 传输：url + headers
     */
    private McpClientTransport buildSseTransport(McpConfig config) {
        if (config.url == null || config.url.isEmpty()) {
            return null;
        }
        HttpClientSseClientTransport.Builder builder = HttpClientSseClientTransport.builder(config.url)
                .customizeClient(clientBuilder -> clientBuilder.connectTimeout(Duration.ofSeconds(10)));
        if (config.headers != null && !config.headers.isEmpty()) {
            builder.httpRequestCustomizer(headerCustomizer(config.headers));
        }
        return builder.build();
    }

    /**
     * 本地进程传输：command + args + env + cwd
     */
    private McpClientTransport buildStdioTransport(McpConfig config) {
        if (config.command == null || config.command.isEmpty()) {
            return null;
        }
        ServerParameters.Builder params = ServerParameters.builder(config.command);
        if (config.args != null && !config.args.isEmpty()) {
            params.args(config.args);
        }
        if (config.env != null && !config.env.isEmpty()) {
            params.env(config.env);
        }
        McpJsonMapper jsonMapper = McpJsonDefaults.getMapper();
        return new StdioClientTransport(params.build(), jsonMapper);
    }

    /**
     * 请求头自定义器：为 MCP HTTP/SSE 请求统一追加 headers
     */
    private io.modelcontextprotocol.client.transport.customizer.McpSyncHttpClientRequestCustomizer headerCustomizer(Map<String, String> headers) {
        return (builder, method, uri, protocolVersion, context) -> {
            for (Map.Entry<String, String> entry : headers.entrySet()) {
                if (entry.getKey() != null && entry.getValue() != null && !entry.getKey().isEmpty()) {
                    builder.header(entry.getKey(), entry.getValue());
                }
            }
        };
    }

    /**
     * 解析 MCP 完整配置：优先 config JSON，缺失时按平铺列兼容推导
     */
    private McpConfig parseConfig(Mcp mcp) {
        McpConfig config = new McpConfig();
        if (mcp.getConfig() != null && !mcp.getConfig().isEmpty()) {
            try {
                JsonObject obj = GSON.fromJson(mcp.getConfig(), JsonObject.class);
                if (obj != null) {
                    JsonElement transportEl = obj.get("transport");
                    config.transport = (transportEl != null && transportEl.isJsonPrimitive())
                            ? transportEl.getAsString() : null;
                    JsonElement urlEl = obj.get("url");
                    config.url = (urlEl != null && urlEl.isJsonPrimitive()) ? urlEl.getAsString() : null;
                    config.headers = parseStringMap(obj.get("headers"));
                    JsonElement commandEl = obj.get("command");
                    config.command = (commandEl != null && commandEl.isJsonPrimitive()) ? commandEl.getAsString() : null;
                    config.args = parseStringList(obj.get("args"));
                    config.env = parseStringMap(obj.get("env"));
                    JsonElement cwdEl = obj.get("cwd");
                    config.cwd = (cwdEl != null && cwdEl.isJsonPrimitive()) ? cwdEl.getAsString() : null;
                }
            } catch (Exception e) {
                logger.warn("MCP config 解析失败, id={}, err={}", mcp.getId(), e.getMessage());
            }
        }
        // 平铺列兜底（存量 / 未回填 config）
        if (config.transport == null) {
            if (mcp.getType() == McpConfig.TYPE_STDIO) {
                config.transport = "stdio";
            } else if (mcp.getType() == McpConfig.TYPE_SSE) {
                config.transport = "sse";
            } else {
                config.transport = "http";
            }
        }
        if (config.url == null) {
            config.url = mcp.getUrl();
        }
        if (config.headers == null) {
            config.headers = parseHeadersString(mcp.getHeaders());
        }
        return config;
    }

    /**
     * headers 解析：兼容「JSON 对象」与「对象字符串」两种形态
     */
    private Map<String, String> parseStringMap(JsonElement element) {
        if (element == null) {
            return null;
        }
        if (element.isJsonObject()) {
            Map<String, String> map = new HashMap<>();
            for (Map.Entry<String, JsonElement> entry : element.getAsJsonObject().entrySet()) {
                if (entry.getValue().isJsonPrimitive()) {
                    map.put(entry.getKey(), entry.getValue().getAsString());
                }
            }
            return map;
        }
        if (element.isJsonPrimitive()) {
            return parseHeadersString(element.getAsString());
        }
        return null;
    }

    /**
     * args 解析：JSON 字符串数组
     */
    private List<String> parseStringList(JsonElement element) {
        if (element == null || !element.isJsonArray()) {
            return null;
        }
        List<String> list = new ArrayList<>();
        for (JsonElement item : element.getAsJsonArray()) {
            if (item.isJsonPrimitive()) {
                list.add(item.getAsString());
            }
        }
        return list;
    }

    /**
     * 平铺 headers 字段解析（历史 JSON 字符串列）
     */
    private Map<String, String> parseHeadersString(String headers) {
        if (headers == null || headers.isEmpty()) {
            return null;
        }
        try {
            JsonElement el = GSON.fromJson(headers, JsonElement.class);
            return parseStringMap(el);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * tool_calls 参数 JSON 解析为 Map
     */
    private Map<String, Object> parseArguments(String argumentsJson) {
        if (argumentsJson == null || argumentsJson.isEmpty()) {
            return new HashMap<>();
        }
        try {
            JsonElement el = GSON.fromJson(argumentsJson, JsonElement.class);
            if (el != null && el.isJsonObject()) {
                return GSON.fromJson(el.getAsJsonObject(), Map.class);
            }
        } catch (Exception e) {
            logger.warn("MCP 工具参数解析失败, err={}", e.getMessage());
        }
        return new HashMap<>();
    }

    /**
     * 工具调用结果文本提取
     */
    private String readText(McpSchema.CallToolResult result) {
        if (result == null) {
            return "";
        }
        if (result.content() != null) {
            StringBuilder text = new StringBuilder();
            for (McpSchema.Content content : result.content()) {
                if (content instanceof McpSchema.TextContent) {
                    text.append(((McpSchema.TextContent) content).text());
                }
            }
            if (text.length() > 0) {
                return text.toString();
            }
        }
        if (result.structuredContent() != null) {
            return GSON.toJson(result.structuredContent());
        }
        return String.valueOf(result);
    }

    /**
     * 配置指纹：config JSON + 平铺列 + 更新时间变化即失效重建
     */
    private long fingerprint(Mcp mcp) {
        return mcp.getId() * 31L + String.valueOf(mcp.getConfig()).hashCode() + String.valueOf(mcp.getUrl()).hashCode();
    }

    /**
     * 客户端缓存项
     */
    private record CachedClient(long fingerprint, McpSyncClient sync) {
    }

    /**
     * 工具缓存项
     */
    private record CachedTools(long fingerprint, List<McpToolInfo> tools) {
    }

    /**
     * 解析后的 MCP server 配置模型
     */
    private static class McpConfig {
        private static final int TYPE_HTTP = 0;
        private static final int TYPE_SSE = 1;
        private static final int TYPE_STDIO = 2;

        private String transport;       /* http/sse/stdio */
        private String url;             /* 服务地址 */
        private Map<String, String> headers;    /* 请求头 */
        private String command;         /* stdio 命令 */
        private List<String> args;      /* stdio 参数 */
        private Map<String, String> env;        /* stdio 环境变量 */
        private String cwd;             /* stdio 工作目录 */
    }

    /**
     * MCP 工具信息（供 Agent 装配 OpenAI tools）
     */
    public static class McpToolInfo {
        private long mcpId;                 /* 所属 MCP 服务ID */
        private String mcpName;             /* 所属 MCP 服务名称 */
        private String toolName;            /* 工具名称 */
        private String description;         /* 工具描述 */
        private Map<String, Object> inputSchema;    /* 入参 JSON Schema */

        public McpToolInfo(long mcpId, String mcpName, String toolName, String description, Map<String, Object> inputSchema) {
            this.mcpId = mcpId;
            this.mcpName = mcpName;
            this.toolName = toolName;
            this.description = description;
            this.inputSchema = inputSchema;
        }

        public long getMcpId() {
            return mcpId;
        }

        public String getMcpName() {
            return mcpName;
        }

        public String getToolName() {
            return toolName;
        }

        public String getDescription() {
            return description;
        }

        public Map<String, Object> getInputSchema() {
            return inputSchema;
        }
    }

    /**
     * 连通性测试结果
     */
    public static class McpConnectResult {
        private boolean connectable;        /* 是否连通 */
        private String serverName;          /* 服务名称（server_info.name） */
        private String serverVersion;       /* 服务版本（server_info.version） */
        private String instructions;        /* 服务说明（server instructions） */
        private int toolCount;              /* 可用工具数量 */
        private long elapsedMs;             /* 测试耗时（毫秒） */
        private String message;             /* 测试过程描述 */
        private List<McpToolDetail> tools;  /* 可用工具明细 */

        public static McpConnectResult ok(String serverName, String serverVersion, String instructions,
                                          List<McpToolDetail> tools, long elapsedMs, String message) {
            McpConnectResult result = new McpConnectResult();
            result.connectable = true;
            result.serverName = serverName;
            result.serverVersion = serverVersion;
            result.instructions = instructions;
            result.toolCount = tools.size();
            result.elapsedMs = elapsedMs;
            result.message = message;
            result.tools = tools;
            return result;
        }

        public static McpConnectResult fail(int toolCount, long elapsedMs, String message) {
            McpConnectResult result = new McpConnectResult();
            result.connectable = false;
            result.toolCount = toolCount;
            result.elapsedMs = elapsedMs;
            result.message = message;
            result.tools = new ArrayList<>();
            return result;
        }

        public boolean isConnectable() {
            return connectable;
        }

        public String getServerName() {
            return serverName;
        }

        public String getServerVersion() {
            return serverVersion;
        }

        public String getInstructions() {
            return instructions;
        }

        public int getToolCount() {
            return toolCount;
        }

        public long getElapsedMs() {
            return elapsedMs;
        }

        public String getMessage() {
            return message;
        }

        public List<McpToolDetail> getTools() {
            return tools;
        }
    }

    /**
     * 工具明细（测试结果展示用）
     */
    public static class McpToolDetail {
        private String name;        /* 工具名称 */
        private String title;       /* 工具标题 */
        private String description; /* 工具介绍 */

        public McpToolDetail(String name, String title, String description) {
            this.name = name;
            this.title = title;
            this.description = description;
        }

        public String getName() {
            return name;
        }

        public String getTitle() {
            return title;
        }

        public String getDescription() {
            return description;
        }
    }

}