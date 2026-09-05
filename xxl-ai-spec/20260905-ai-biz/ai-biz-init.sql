SET NAMES utf8mb4;

-- ==================== AI 业务中台：初始化种子数据 ====================

-- 1、默认业务空间
INSERT INTO `xxl_ai_space` (`name`, `code`, `status`, `remark`, `add_time`, `update_time`)
VALUES ('默认空间', 'default', 0, '系统默认业务空间', NOW(), NOW());

-- 2、预设供应商（admin 在页面可随时修改 BaseURL/Key）
INSERT INTO `xxl_ai_supplier` (`space_id`, `name`, `code`, `type`, `base_url`, `api_key`, `status`, `remark`, `add_time`, `update_time`)
VALUES
  (1, 'Deepseek', 'deepseek', 0, 'https://api.deepseek.com', '', 0, 'Deepseek 对话模型', NOW(), NOW()),
  (1, '智谱GLM', 'glm', 2, 'https://open.bigmodel.cn/api/paas/v4', '', 0, '智谱 对话+嵌入模型', NOW(), NOW()),
  (1, 'OpenCodeGo', 'opencodego', 0, '', '', 0, '占位供应商，BaseURL/模型请按需配置', NOW(), NOW());

-- 3、预设供应商模型
INSERT INTO `xxl_ai_supplier_model` (`supplier_id`, `name`, `model`, `type`, `status`, `add_time`, `update_time`)
VALUES
  (1, 'Deepseek Chat', 'deepseek-chat', 0, 0, NOW(), NOW()),
  (1, 'Deepseek Reasoner', 'deepseek-reasoner', 0, 0, NOW(), NOW()),
  (2, 'GLM-4-Flash', 'glm-4-flash', 0, 0, NOW(), NOW()),
  (2, 'GLM-4-Plus', 'glm-4-plus', 0, 0, NOW(), NOW()),
  (2, 'GLM-4-Air', 'glm-4-air', 0, 0, NOW(), NOW()),
  (2, 'Embedding-3', 'embedding-3', 1, 0, NOW(), NOW()),
  (3, 'OpenCodeGo Chat', 'opencodego-chat', 0, 0, NOW(), NOW());

-- 4、社区查询配置（框架配置）
INSERT INTO `xxl_ai_config` (`name`, `key`, `value`, `status`, `remark`, `add_time`, `update_time`)
VALUES ('MCP社区地址', 'system.mcp.community.url', 'https://registry.mcp.so/api', 0, 'MCP 社区检索接口地址，不可达时前端友好降级', NOW(), NOW()),
       ('Skill社区地址', 'system.skill.community.url', '', 0, 'Skill 社区检索接口地址，可配置为空则禁用社区查询', NOW(), NOW());