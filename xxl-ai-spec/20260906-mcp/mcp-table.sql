SET NAMES utf8mb4;

-- 说明：MCP 配置完整格式兼容已同步进 doc/db/tables_xxl_ai.sql（新库初始化直接生效）。
-- 本脚本仅供「已初始化环境」增量升级使用。

-- MCP 配置完整格式兼容：增 config 列 + 放宽 url + 扩展 type（stdio）
ALTER TABLE `xxl_ai_mcp`
    ADD COLUMN `config` TEXT NULL COMMENT '完整MCP配置(JSON)：http {transport,url,headers} / sse {transport,url,headers} / stdio {transport,command,args,env,cwd}' AFTER `headers`;

ALTER TABLE `xxl_ai_mcp`
    MODIFY COLUMN `url` VARCHAR(200) NULL DEFAULT NULL COMMENT '服务地址(HTTP/SSE必填，stdio可为空)',
    MODIFY COLUMN `type` TINYINT NOT NULL DEFAULT 0 COMMENT '协议类型：0-Streamable HTTP、1-SSE、2-stdio';

-- 存量回填 config（headers 以字符串形式保留，解析时兼容对象/字符串两种形态）
UPDATE `xxl_ai_mcp`
SET `config` = CONCAT(
    '{"transport":"', IF(`type` = 1, 'sse', 'http'), '"',
    CASE WHEN `url` IS NOT NULL AND `url` <> '' THEN CONCAT(',"url":', JSON_QUOTE(`url`)) ELSE '' END,
    CASE WHEN `headers` IS NOT NULL AND `headers` <> '' THEN CONCAT(',"headers":', JSON_QUOTE(`headers`)) ELSE '' END,
    '}'
)
WHERE `config` IS NULL OR `config` = '';