-- 知识文档管理改造：辅助变更 SQL（在 tables_xxl_ai.sql 之后执行，幂等）
SET NAMES utf8mb4;

-- 1、知识库文档 content 列升级 MEDIUMTEXT（支持长文本）
ALTER TABLE xxl_ai_knowledge_doc MODIFY COLUMN content MEDIUMTEXT NULL COMMENT '文档内容';

-- 2、普通用户默认授权默认空间（保证顶部空间切换器/知识库功能可用）
INSERT INTO xxl_ai_user_space (`user_id`, `space_id`, `add_time`, `update_time`)
SELECT 2, `id`, NOW(), NOW() FROM xxl_ai_space WHERE `code` = 'default'
ON DUPLICATE KEY UPDATE `update_time` = NOW();

-- 3、Ollama 嵌入模型修正类型（type=1 嵌入，保证知识库向量化校验通过）
UPDATE xxl_ai_supplier_model SET `type` = 1 WHERE `model` = 'qwen3-embedding:0.6b' AND `type` = 0;