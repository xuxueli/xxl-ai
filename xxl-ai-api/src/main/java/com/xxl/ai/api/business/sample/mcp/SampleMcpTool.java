package com.xxl.ai.api.business.sample.mcp;

import io.modelcontextprotocol.server.McpServerFeatures;
import io.modelcontextprotocol.spec.McpSchema;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * 示例 MCP 工具集（应用内嵌 Streamable HTTP MCP 服务）
 *
 * 内置示例工具，作为平台 MCP「连接测试」与 Agent 工具调用的开箱即用联调用例：
 *  - get_current_time  本地时钟服务
 *  - calculator        计算器服务
 *
 * @author xxl-ai 2026-09-12
 */
public final class SampleMcpTool {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private SampleMcpTool() {
    }

    /**
     * 本地时钟服务：获取服务器当前时间
     */
    public static McpServerFeatures.SyncToolSpecification currentTime() {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", new LinkedHashMap<>());
        return build("get_current_time", "获取服务器当前时间", schema, args ->
                "当前时间: " + LocalDateTime.now().format(FMT));
    }

    /**
     * 计算器服务：四则运算表达式求值（安全解析，不执行任意代码）
     */
    public static McpServerFeatures.SyncToolSpecification calculator() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("expression", Map.of("type", "string", "description", "算术表达式，如 1+2*3"));
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        schema.put("required", List.of("expression"));
        return build("calculator", "四则运算计算器", schema, args -> {
            String expr = str(args.get("expression"), "").trim();
            if (!expr.matches("[0-9+\\-*/().\\s]+")) {
                return "表达式不合法（仅支持数字与 + - * / ( )）";
            }
            try {
                return "计算结果: " + expr + " = " + new ExprParser(expr).parse().toPlainString();
            } catch (Exception e) {
                return "表达式计算失败: " + expr + "（" + e.getMessage() + "）";
            }
        });
    }

    /**
     * 构建工具规格：入参透传 + 执行器结果回写为文本内容（异常兜底为错误文本）
     */
    private static McpServerFeatures.SyncToolSpecification build(String name, String title,
                                                                 Map<String, Object> inputSchema,
                                                                 Function<Map<String, Object>, String> executor) {
        McpSchema.Tool tool = McpSchema.Tool.builder(name, inputSchema).title(title).build();
        return McpServerFeatures.SyncToolSpecification.builder()
                .tool(tool)
                .callHandler((exchange, request) -> {
                    String text;
                    try {
                        Map<String, Object> arguments =
                                request.arguments() == null ? Map.of() : request.arguments();
                        text = executor.apply(arguments);
                    } catch (Exception e) {
                        text = "工具执行失败: " + e.getMessage();
                    }
                    return McpSchema.CallToolResult.builder(List.of(McpSchema.TextContent.builder(text).build()))
                            .isError(false)
                            .build();
                })
                .build();
    }

    /**
     * 参数取值兜底
     */
    private static String str(Object value, String defaultValue) {
        return value == null ? defaultValue : String.valueOf(value);
    }

    /**
     * 简易四则运算解析器（递归下降，支持 + - * / ( ) 与小数点）
     */
    private static final class ExprParser {

        private final String src;
        private int index;

        ExprParser(String src) {
            this.src = src;
        }

        BigDecimal parse() {
            skipSpaces();
            BigDecimal value = expr();
            skipSpaces();
            if (index < src.length()) {
                throw new IllegalArgumentException("非法字符: " + src.charAt(index));
            }
            return value;
        }

        private BigDecimal expr() {
            BigDecimal value = term();
            while (index < src.length()) {
                char c = src.charAt(index);
                if (c == '+') {
                    index++;
                    value = value.add(term());
                } else if (c == '-') {
                    index++;
                    value = value.subtract(term());
                } else {
                    break;
                }
            }
            return value;
        }

        private BigDecimal term() {
            BigDecimal value = factor();
            while (index < src.length()) {
                char c = src.charAt(index);
                if (c == '*') {
                    index++;
                    value = value.multiply(factor());
                } else if (c == '/') {
                    index++;
                    value = value.divide(factor(), 6, RoundingMode.HALF_UP).stripTrailingZeros();
                } else {
                    break;
                }
            }
            return value;
        }

        private BigDecimal factor() {
            skipSpaces();
            if (index >= src.length()) {
                throw new IllegalArgumentException("表达式不完整");
            }
            char c = src.charAt(index);
            if (c == '+') {
                index++;
                return factor();
            }
            if (c == '-') {
                index++;
                return factor().negate();
            }
            if (c == '(') {
                index++;
                BigDecimal value = expr();
                skipSpaces();
                if (index >= src.length() || src.charAt(index) != ')') {
                    throw new IllegalArgumentException("缺少右括号");
                }
                index++;
                return value;
            }
            int start = index;
            while (index < src.length()
                    && (Character.isDigit(src.charAt(index)) || src.charAt(index) == '.')) {
                index++;
            }
            if (start == index) {
                throw new IllegalArgumentException("非法字符: " + c);
            }
            return new BigDecimal(src.substring(start, index));
        }

        private void skipSpaces() {
            while (index < src.length() && Character.isWhitespace(src.charAt(index))) {
                index++;
            }
        }
    }

}