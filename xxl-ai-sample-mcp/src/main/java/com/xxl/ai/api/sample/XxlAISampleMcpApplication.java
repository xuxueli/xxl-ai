package com.xxl.ai.api.sample;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * XXL-AI 示例服务启动类（独立运行，端口 8091）
 *
 * 作为平台 MCP「连接测试」与 Agent 工具调用的开箱即用联调用例，单端点聚合全部示例工具：
 *  - /sample/mcp  Streamable HTTP MCP 服务（get_current_time / calculator）
 *
 * @author xxl-ai 2026-09-13
 */
@SpringBootApplication
public class XxlAISampleMcpApplication {

    public static void main(String[] args) {
        SpringApplication.run(XxlAISampleMcpApplication.class, args);
    }

}