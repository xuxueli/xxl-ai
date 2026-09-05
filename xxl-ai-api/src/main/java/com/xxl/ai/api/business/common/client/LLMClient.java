package com.xxl.ai.api.business.common.client;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/**
 * LLM 客户端（OpenAI 兼容协议）
 *
 * 支持：对话流式输出（chat/completions, stream=true）、嵌入向量化（embeddings）
 * 供应商 BaseURL：直接拼接 /chat/completions、/embeddings，可兼容 Deepseek / GLM / Ollama(/v1) 等
 *
 * @author xxl-ai 2026-09-05
 */
@Component
public class LLMClient {
    private static Logger logger = LoggerFactory.getLogger(LLMClient.class);

    private static final Gson GSON = new Gson();

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    /**
     * 对话流式输出（阻塞，流式回调）
     *
     * @param messages    消息列表（role/content）
     * @param baseUrl     供应商BaseURL
     * @param apiKey      API密钥（可为空）
     * @param model       模型标识
     * @param onThinking  思考过程片段回调（推理模型 delta.reasoning_content，可为空）
     * @param onChunk     回复内容片段回调（可为空）
     * @return 完整回复文本（不含思考过程）
     */
    public String chatStream(List<Map<String, String>> messages, String baseUrl, String apiKey, String model,
                             Consumer<String> onThinking, Consumer<String> onChunk) throws Exception {
        JsonObject body = new JsonObject();
        body.addProperty("model", model);
        body.add("messages", GSON.toJsonTree(messages));
        body.addProperty("stream", true);

        HttpResponse<InputStream> response = doPost(baseUrl + "/chat/completions", apiKey, body);
        if (response.statusCode() != 200) {
            throw new RuntimeException("模型接口异常，HTTP " + response.statusCode() + "：" + readBody(response));
        }

        StringBuilder fullText = new StringBuilder();
        BufferedReader reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8));
        String line;
        String originData = "";
        while ((line = reader.readLine()) != null) {
            originData += File.separator + line;
            if (!line.startsWith("data:")) {
                continue;
            }
            String payload = line.substring(5).trim();
            if (payload.isEmpty() || payload.equals("[DONE]")) {
                continue;
            }
            JsonElement root = GSON.fromJson(payload, JsonElement.class);
            if (!root.isJsonObject()) {
                continue;
            }
            JsonArray choices = root.getAsJsonObject().getAsJsonArray("choices");
            if (choices == null || choices.isEmpty()) {
                continue;
            }
            JsonElement delta = choices.get(0).getAsJsonObject().get("delta");
            if (delta != null && delta.isJsonObject()) {
                JsonObject deltaObj = delta.getAsJsonObject();
                // 思考过程（compatible 推理模型 reasoning_content，如 DeepSeek-R1 系列）
                JsonElement reasoningElement = deltaObj.get("reasoning_content");
                if (reasoningElement != null && reasoningElement.isJsonPrimitive()
                        && !reasoningElement.getAsString().isEmpty()) {
                    String thinking = reasoningElement.getAsString();
                    if (onThinking != null) {
                        onThinking.accept(thinking);
                    }
                }
                // 回复内容
                JsonElement contentElement = deltaObj.get("content");
                if (contentElement != null && contentElement.isJsonPrimitive()
                        && !contentElement.getAsString().isEmpty()) {
                    String chunk = contentElement.getAsString();
                    fullText.append(chunk);
                    if (onChunk != null) {
                        onChunk.accept(chunk);
                    }
                }
            }
        }
        logger.debug("LLMClient.chatStream originData: {}", originData);
        return fullText.toString();
    }

    /**
     * 对话（非流式，支持工具调用 function calling）
     *
     * @param messages 消息列表（role/content/tool_calls/tool_call_id 等）
     * @param tools    OpenAI tools 规格（type=function，可空）
     * @param baseUrl  供应商BaseURL
     * @param apiKey   API密钥（可为空）
     * @param model    模型标识
     * @return 对话结果（内容 + 工具调用，二选一）
     */
    public ChatResult chat(List<Map<String, Object>> messages, List<Map<String, Object>> tools,
                           String baseUrl, String apiKey, String model) throws Exception {
        JsonObject body = new JsonObject();
        body.addProperty("model", model);
        body.add("messages", GSON.toJsonTree(messages));
        if (tools != null && !tools.isEmpty()) {
            body.add("tools", GSON.toJsonTree(tools));
        }
        body.addProperty("stream", false);

        HttpResponse<InputStream> response = doPost(baseUrl + "/chat/completions", apiKey, body);
        if (response.statusCode() != 200) {
            throw new RuntimeException("模型接口异常，HTTP " + response.statusCode() + "：" + readBody(response));
        }
        JsonObject root = GSON.fromJson(new InputStreamReader(response.body(), StandardCharsets.UTF_8), JsonObject.class);
        JsonArray choices = root.getAsJsonArray("choices");
        if (choices == null || choices.isEmpty() || !choices.get(0).isJsonObject()) {
            throw new RuntimeException("模型返回为空");
        }
        JsonObject choiceObj = choices.get(0).getAsJsonObject();
        if (choiceObj.get("message") == null) {
            throw new RuntimeException("模型返回为空");
        }
        JsonObject messageObj = choiceObj.getAsJsonObject("message");
        ChatResult result = new ChatResult();
        JsonElement reasoningElement = messageObj.get("reasoning_content");
        if (reasoningElement != null && reasoningElement.isJsonPrimitive()) {
            result.reasoning = reasoningElement.getAsString();
        }
        JsonElement contentElement = messageObj.get("content");
        if (contentElement != null && contentElement.isJsonPrimitive()) {
            result.content = contentElement.getAsString();
        }
        JsonElement finishElement = choiceObj.get("finish_reason");
        if (finishElement != null && finishElement.isJsonPrimitive()) {
            result.finishReason = finishElement.getAsString();
        }
        JsonArray toolCallsArray = messageObj.getAsJsonArray("tool_calls");
        if (toolCallsArray != null && !toolCallsArray.isEmpty()) {
            List<ToolCall> toolCalls = new ArrayList<>();
            for (JsonElement toolCallEl : toolCallsArray) {
                JsonObject toolCallObj = toolCallEl.getAsJsonObject();
                JsonObject functionObj = toolCallObj.getAsJsonObject("function");
                ToolCall toolCall = new ToolCall();
                JsonElement idEl = toolCallObj.get("id");
                if (idEl != null && idEl.isJsonPrimitive()) {
                    toolCall.id = idEl.getAsString();
                }
                if (functionObj != null) {
                    JsonElement nameEl = functionObj.get("name");
                    if (nameEl != null && nameEl.isJsonPrimitive()) {
                        toolCall.name = nameEl.getAsString();
                    }
                    JsonElement argsEl = functionObj.get("arguments");
                    if (argsEl != null && argsEl.isJsonPrimitive()) {
                        toolCall.arguments = argsEl.getAsString();
                    }
                }
                toolCalls.add(toolCall);
            }
            result.toolCalls = toolCalls;
        }
        return result;
    }

    /**
     * 嵌入向量化
     *
     * @param input   待向量化文本
     * @param baseUrl 供应商BaseURL
     * @param apiKey  API密钥（可为空）
     * @param model   嵌入模型标识
     * @return 向量（float[]）
     */
    public float[] embedding(String input, String baseUrl, String apiKey, String model) throws Exception {
        JsonObject body = new JsonObject();
        body.addProperty("model", model);
        body.addProperty("input", input);

        HttpResponse<InputStream> response = doPost(baseUrl + "/embeddings", apiKey, body);
        if (response.statusCode() != 200) {
            throw new RuntimeException("嵌入接口异常，HTTP " + response.statusCode() + "：" + readBody(response));
        }
        JsonObject root = GSON.fromJson(new InputStreamReader(response.body(), StandardCharsets.UTF_8), JsonObject.class);
        JsonArray data = root.getAsJsonArray("data");
        if (data == null || data.isEmpty()) {
            throw new RuntimeException("嵌入结果异常，未解析到向量");
        }
        JsonArray embedding = data.get(0).getAsJsonObject().getAsJsonArray("embedding");
        if (embedding == null) {
            throw new RuntimeException("嵌入结果异常，未解析到向量");
        }
        float[] vector = new float[embedding.size()];
        for (int i = 0; i < embedding.size(); i++) {
            vector[i] = embedding.get(i).getAsFloat();
        }
        return vector;
    }

    /**
     * POST JSON 请求（Authorization Bearer，密钥为空时不携带）
     */
    private HttpResponse<InputStream> doPost(String url, String apiKey, JsonElement body) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(120))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString()));
        if (apiKey != null && !apiKey.isEmpty()) {
            builder.header("Authorization", "Bearer " + apiKey);
        }
        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
    }

    /**
     * 读取错误响应体
     */
    private String readBody(HttpResponse<InputStream> response) throws Exception {
        byte[] bytes = response.body().readAllBytes();
        return new String(bytes, StandardCharsets.UTF_8);
    }

    /**
     * 对话结果封装（内容与工具调用二选一）
     */
    public static class ChatResult {
        private String content;         /* 回复内容（无工具调用时） */
        private String reasoning;       /* 思考过程（推理模型，可为空） */
        private String finishReason;    /* 结束原因（tool_calls/stop） */
        private List<ToolCall> toolCalls;       /* 工具调用（可空） */

        public String getContent() {
            return content;
        }

        public String getReasoning() {
            return reasoning;
        }

        public String getFinishReason() {
            return finishReason;
        }

        public List<ToolCall> getToolCalls() {
            return toolCalls;
        }
    }

    /**
     * 工具调用封装
     */
    public static class ToolCall {
        private String id;              /* 工具调用ID */
        private String name;            /* 工具名称 */
        private String arguments;       /* 参数（JSON 字符串） */

        public String getId() {
            return id;
        }

        public String getName() {
            return name;
        }

        public String getArguments() {
            return arguments;
        }
    }

}