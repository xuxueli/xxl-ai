-- 供应商请求附属 Header 配置（20260912-supplier-header）
-- 1、xxl_ai_supplier 新增 headers 列
--   headers：请求附属Header，JSON 数组 [{"key":"x-opencode-session","value":"{session}"}]
--   value 支持 {session} 占位符：LLM 对话请求时自动替换为当前会话稳定标识（会话ID），
--   会话场景外（如向量化、连通测试）自动跳过带占位符的 header，静态 header 始终携带。
SET NAMES utf8mb4;
ALTER TABLE `xxl_ai_supplier`
    ADD COLUMN `headers` VARCHAR(2000) NULL DEFAULT NULL COMMENT '请求附属Header（JSON数组：[{"key","value"}]，value可含{session}占位符，请求时按会话替换）' AFTER `api_key`;

-- 2、OpenCodeGo 种子：配置 x-opencode-session 会话头（{session} 占位替换）
UPDATE `xxl_ai_supplier`
SET `headers` = '[{"key":"x-opencode-session","value":"{session}"}]'
WHERE `name` = 'OpenCodeGo';