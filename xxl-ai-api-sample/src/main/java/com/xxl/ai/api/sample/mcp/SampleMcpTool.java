package com.xxl.ai.api.sample.mcp;

import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 示例 MCP 工具集（spring-ai 注解式 MCP Server，Streamable HTTP，端点 /sample/mcp）
 *
 * 内置示例工具，作为平台 MCP「连接测试」与 Agent 工具调用的开箱即用联调用例：
 *  - get_current_time  本地时钟
 *  - calculator        四则运算计算器
 *
 * @author xxl-ai 2026-09-13
 */
@Component
public class SampleMcpTool {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /**
     * 本地时钟：获取服务器当前时间
     *
     * @return 服务器当前时间文本
     */
    @McpTool(name = "get_current_time", description = "获取服务器当前时间")
    public String getCurrentTime() {
        return "当前时间: " + LocalDateTime.now().format(FMT);
    }

    /**
     * 四则运算计算器：表达式求值（安全解析，不执行任意代码）
     *
     * @param expression 算术表达式，如 1+2*3
     * @return 计算结果文本
     */
    @McpTool(name = "calculator", description = "四则运算计算器")
    public String calculator(@McpToolParam(description = "算术表达式，如 1+2*3") String expression) {
        String expr = String.valueOf(expression).trim();
        if (!expr.matches("[0-9+\\-*/().\\s]+")) {
            return "表达式不合法（仅支持数字与 + - * / ( )）";
        }
        try {
            return "计算结果: " + expr + " = " + new ExprParser(expr).parse().toPlainString();
        } catch (IllegalArgumentException e) {
            return "表达式计算失败: " + expr + "（" + e.getMessage() + "）";
        }
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