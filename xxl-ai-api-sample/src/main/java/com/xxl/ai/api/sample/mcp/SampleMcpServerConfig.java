package com.xxl.ai.api.sample.mcp;

import io.modelcontextprotocol.server.McpServer;
import io.modelcontextprotocol.server.McpServerFeatures;
import io.modelcontextprotocol.server.McpSyncServer;
import io.modelcontextprotocol.server.transport.HttpServletStreamableServerTransportProvider;
import io.modelcontextprotocol.spec.McpSchema;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.servlet.ServletRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 示例 MCP 服务注册（独立应用内嵌 Streamable HTTP MCP 服务，端口 8091）
 *
 * 用官方 MCP Java SDK 在示例应用中挂载 Streamable HTTP MCP 服务，
 * 作为平台「连接测试」与 Agent 工具调用的开箱即用联调用例：
 *  - /sample/clock/mcp    本地时钟服务（get_current_time）
 *  - /sample/calc/mcp     计算器服务（calculator）
 * 客户端（McpClient）以服务地址完整路径作为 MCP 消息端点（不再自动追加 /mcp），
 * 故 DB 种子的 url 需含 /mcp 后缀，与挂载端点对齐
 *
 * @author xxl-ai 2026-09-13
 */
@Configuration
public class SampleMcpServerConfig {

    private static final Logger logger = LoggerFactory.getLogger(SampleMcpServerConfig.class);

    /** 示例服务基础路径（DB 种子 config.url 为完整端点，如 http://127.0.0.1:8091/sample/clock/mcp） */
    private static final String BASE_PATH = "/sample";

    /** 已构建的同步 MCP 服务（会话容器依赖其存活，保活防 GC 回收） */
    private final Map<String, McpSyncServer> servers = new ConcurrentHashMap<>();

    /**
     * 本地时钟服务
     */
    @Bean
    public ServletRegistrationBean<HttpServletStreamableServerTransportProvider> sampleClockMcpServlet() {
        return register("本地时钟服务", BASE_PATH + "/clock", SampleMcpTool.currentTime(),
                "内置示例：本地时钟服务（Streamable HTTP），提供 get_current_time 工具");
    }

    /**
     * 计算器服务
     */
    @Bean
    public ServletRegistrationBean<HttpServletStreamableServerTransportProvider> sampleCalcMcpServlet() {
        return register("计算器服务", BASE_PATH + "/calc", SampleMcpTool.calculator(),
                "内置示例：计算器服务（Streamable HTTP），提供 calculator 工具");
    }

    /**
     * 构建单个示例 MCP 服务：传输层 provider + 同步服务装配，挂载为 Servlet
     *
     * @param serverName   服务名称（server_info.name）
     * @param path         服务地址路径（不含客户端消息端点 /mcp 后缀）
     * @param toolSpec     工具规格（单工具服务）
     * @param instructions 服务说明
     * @return Servlet 注册项
     */
    private ServletRegistrationBean<HttpServletStreamableServerTransportProvider> register(
            String serverName, String path, McpServerFeatures.SyncToolSpecification toolSpec, String instructions) {
        // 客户端以服务地址完整路径作为 MCP 消息端点（不再额外追加 /mcp），
        // 因此服务端挂载路径取 {path}/mcp，与 provider.mcpEndpoint / DB 种子 url 保持一致
        String endpoint = path + "/mcp";
        HttpServletStreamableServerTransportProvider provider = HttpServletStreamableServerTransportProvider
                .builder()
                .mcpEndpoint(endpoint)
                .build();
        McpSyncServer server = McpServer.sync(provider)
                .serverInfo(serverName, "1.0.0")
                .instructions(instructions)
                .capabilities(McpSchema.ServerCapabilities.builder().tools(false).build())
                .tools(List.of(toolSpec))
                .build();
        servers.put(endpoint, server);

        ServletRegistrationBean<HttpServletStreamableServerTransportProvider> registration =
                new ServletRegistrationBean<>(provider, endpoint);
        registration.setName("sampleMcp" + serverName);
        registration.setAsyncSupported(true);
        logger.info("示例 MCP 服务已注册, name={}, url=http://127.0.0.1:8091{}", serverName, endpoint);
        return registration;
    }

}