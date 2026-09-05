--
-- XXL-AI
-- Copyright (c) 2015-present, xuxueli.

CREATE DATABASE IF NOT EXISTS `xxl_ai` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `xxl_ai`;
SET NAMES utf8mb4;

-- ==================== AI 业务表 ====================

-- 1、业务空间表
CREATE TABLE IF NOT EXISTS `xxl_ai_space` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL COMMENT '空间名称',
    `code` VARCHAR(50) NOT NULL COMMENT '空间编码',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0-正常、1-停用',
    `remark` VARCHAR(255) NULL DEFAULT NULL COMMENT '备注',
    `add_time` DATETIME NOT NULL COMMENT '新增时间',
    `update_time` DATETIME NOT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `i_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='业务空间表';

-- 2、用户-空间关联表
CREATE TABLE IF NOT EXISTS `xxl_ai_user_space` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` INT NOT NULL COMMENT '用户ID',
    `space_id` BIGINT NOT NULL COMMENT '空间ID',
    `add_time` DATETIME NOT NULL COMMENT '新增时间',
    `update_time` DATETIME NOT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `i_user_space` (`user_id`, `space_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户-空间关联表';

-- 3、供应商表
CREATE TABLE IF NOT EXISTS `xxl_ai_supplier` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `space_id` BIGINT NOT NULL COMMENT '空间ID',
    `name` VARCHAR(50) NOT NULL COMMENT '供应商名称',
    `base_url` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '接口地址',
    `api_key` VARCHAR(200) NOT NULL DEFAULT '' COMMENT 'API密钥',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0-正常、1-停用',
    `remark` VARCHAR(255) NULL DEFAULT NULL COMMENT '备注',
    `add_time` DATETIME NOT NULL COMMENT '新增时间',
    `update_time` DATETIME NOT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `i_space_id` (`space_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供应商表';

-- 4、供应商模型表
CREATE TABLE IF NOT EXISTS `xxl_ai_supplier_model` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `supplier_id` BIGINT NOT NULL COMMENT '供应商ID',
    `name` VARCHAR(50) NOT NULL COMMENT '模型展示名称',
    `model` VARCHAR(100) NOT NULL COMMENT '模型标识',
    `type` TINYINT NOT NULL DEFAULT 0 COMMENT '类型：0-对话、1-嵌入',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0-正常、1-停用',
    `add_time` DATETIME NOT NULL COMMENT '新增时间',
    `update_time` DATETIME NOT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `i_supplier_id` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供应商模型表';

-- 5、MCP 服务表
CREATE TABLE IF NOT EXISTS `xxl_ai_mcp` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `space_id` BIGINT NOT NULL COMMENT '空间ID',
    `name` VARCHAR(100) NOT NULL COMMENT 'MCP名称',
    `type` TINYINT NOT NULL DEFAULT 0 COMMENT '协议类型：0-Streamable HTTP、1-SSE、2-stdio',
    `url` VARCHAR(200) NULL DEFAULT NULL COMMENT '服务地址(HTTP/SSE必填，stdio可为空)',
    `headers` VARCHAR(500) NULL DEFAULT NULL COMMENT '请求头(JSON)',
    `config` TEXT NULL COMMENT '完整MCP配置(JSON)：http/sse{transport,url,headers} stdio{transport,command,args,env,cwd}',
    `description` VARCHAR(500) NULL DEFAULT NULL COMMENT '描述',
    `source` VARCHAR(20) NOT NULL DEFAULT 'local' COMMENT '来源：local-本地、community-社区',
    `source_url` VARCHAR(200) NULL DEFAULT NULL COMMENT '社区来源链接',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0-正常、1-停用',
    `add_time` DATETIME NOT NULL COMMENT '新增时间',
    `update_time` DATETIME NOT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `i_space_id` (`space_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='MCP服务表';

-- 6、Skill 表
CREATE TABLE IF NOT EXISTS `xxl_ai_skill` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `space_id` BIGINT NOT NULL COMMENT '空间ID',
    `name` VARCHAR(100) NOT NULL COMMENT 'Skill名称',
    `description` VARCHAR(500) NULL DEFAULT NULL COMMENT '描述',
    `content` TEXT NULL COMMENT 'Skill内容(指令/流程)',
    `version` VARCHAR(20) NOT NULL DEFAULT '1.0' COMMENT '版本',
    `source` VARCHAR(20) NOT NULL DEFAULT 'local' COMMENT '来源：local-本地、community-社区',
    `source_url` VARCHAR(200) NULL DEFAULT NULL COMMENT '社区来源链接',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0-正常、1-停用',
    `add_time` DATETIME NOT NULL COMMENT '新增时间',
    `update_time` DATETIME NOT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `i_space_id` (`space_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Skill表';

-- 7、知识库表
CREATE TABLE IF NOT EXISTS `xxl_ai_knowledge_base` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `space_id` BIGINT NOT NULL COMMENT '空间ID',
    `name` VARCHAR(100) NOT NULL COMMENT '知识库名称',
    `description` VARCHAR(500) NULL DEFAULT NULL COMMENT '描述',
    `embed_supplier_id` BIGINT NOT NULL DEFAULT 0 COMMENT '向量化供应商ID',
    `embed_model_id` BIGINT NOT NULL DEFAULT 0 COMMENT '向量化模型ID',
    `chunk_size` INT NOT NULL DEFAULT 500 COMMENT '分片大小',
    `chunk_overlap` INT NOT NULL DEFAULT 50 COMMENT '分片重叠',
    `top_k` INT NOT NULL DEFAULT 5 COMMENT '检索数量',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0-正常、1-停用',
    `add_time` DATETIME NOT NULL COMMENT '新增时间',
    `update_time` DATETIME NOT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `i_space_id` (`space_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识库表';

-- 8、知识文档表
CREATE TABLE IF NOT EXISTS `xxl_ai_knowledge_doc` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `space_id` BIGINT NOT NULL COMMENT '空间ID',
    `base_id` BIGINT NOT NULL COMMENT '知识库ID',
    `name` VARCHAR(200) NOT NULL COMMENT '文档名称',
    `content` TEXT NULL COMMENT '文档内容',
    `chunk_count` INT NOT NULL DEFAULT 0 COMMENT '分片数量',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0-未处理、1-已向量化、2-失败',
    `add_time` DATETIME NOT NULL COMMENT '新增时间',
    `update_time` DATETIME NOT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `i_base_id` (`base_id`),
    KEY `i_space_id` (`space_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='知识文档表';

-- 9、Agent 表
CREATE TABLE IF NOT EXISTS `xxl_ai_agent` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `space_id` BIGINT NOT NULL COMMENT '空间ID',
    `name` VARCHAR(100) NOT NULL COMMENT 'Agent名称',
    `intro` VARCHAR(500) NULL DEFAULT NULL COMMENT 'Agent介绍',
    `model_supplier_id` BIGINT NOT NULL DEFAULT 0 COMMENT '模型供应商ID',
    `model_id` BIGINT NOT NULL DEFAULT 0 COMMENT '模型ID',
    `system_prompt` TEXT NULL COMMENT '系统指令',
    `kb_ids` VARCHAR(500) NULL DEFAULT NULL COMMENT '知识库ID集合(逗号分隔)',
    `mcp_ids` VARCHAR(500) NULL DEFAULT NULL COMMENT 'MCP ID集合(逗号分隔)',
    `skill_ids` VARCHAR(500) NULL DEFAULT NULL COMMENT 'Skill ID集合(逗号分隔)',
    `publish_status` TINYINT NOT NULL DEFAULT 0 COMMENT '发布状态：0-未发布、1-已发布',
    `uuid` VARCHAR(32) NULL DEFAULT NULL COMMENT '访问UUID',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0-正常、1-停用',
    `add_time` DATETIME NOT NULL COMMENT '新增时间',
    `update_time` DATETIME NOT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `i_space_id` (`space_id`),
    UNIQUE KEY `i_uuid` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent表';

-- 10、Agent 对话表
CREATE TABLE IF NOT EXISTS `xxl_ai_agent_conv` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `agent_uuid` VARCHAR(32) NOT NULL COMMENT 'Agent访问UUID',
    `visitor_id` VARCHAR(64) NOT NULL COMMENT '访客标识',
    `title` VARCHAR(100) NOT NULL DEFAULT '新对话' COMMENT '对话标题',
    `add_time` DATETIME NOT NULL COMMENT '新增时间',
    `update_time` DATETIME NOT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `i_agent_visitor` (`agent_uuid`, `visitor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent对话表';

-- 11、Agent 消息表
CREATE TABLE IF NOT EXISTS `xxl_ai_agent_msg` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `conv_id` BIGINT NOT NULL COMMENT '对话ID',
    `role` VARCHAR(10) NOT NULL COMMENT '角色：user/assistant',
    `reasoning` TEXT NULL COMMENT '思考过程（推理模型 reasoning_content）',
    `content` TEXT NOT NULL COMMENT '消息内容',
    `add_time` DATETIME NOT NULL COMMENT '新增时间',
    `update_time` DATETIME NOT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `i_conv_id` (`conv_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent消息表';SET NAMES utf8mb4;


-- ================== user and base ==================

-- 1、用户表
CREATE TABLE `xxl_ai_user`
(
    `id`            INT             NOT NULL AUTO_INCREMENT      COMMENT '用户ID',
    `username`      VARCHAR(50)     NOT NULL                     COMMENT '账号',
    `password`      VARCHAR(100)    NOT NULL                     COMMENT '密码加密信息',
    `token`         VARCHAR(100)    DEFAULT NULL                 COMMENT '登录token',
    `status`        TINYINT         NOT NULL                     COMMENT '状态：0-正常、1-禁用',
    `role`          VARCHAR(20)     NOT NULL DEFAULT 'user'      COMMENT '角色编码：admin-管理员、user-普通用户',
    `real_name`     VARCHAR(50)     DEFAULT NULL                 COMMENT '真实姓名',
    `email`         VARCHAR(100)    DEFAULT NULL                 COMMENT '邮箱',
    `add_time`      DATETIME        NOT NULL                     COMMENT '新增时间',
    `update_time`   DATETIME        NOT NULL                     COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `i_username` (`username`) USING BTREE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;

-- 2、系统配置表
CREATE TABLE `xxl_ai_config`
(
    `id`                BIGINT          NOT NULL AUTO_INCREMENT     COMMENT '配置ID',
    `name`              VARCHAR(100)    NOT NULL                    COMMENT '配置名称',
    `key`               VARCHAR(100)    NOT NULL                    COMMENT '配置Key',
    `value`             VARCHAR(500)    NOT NULL                    COMMENT '配置Value',
    `status`            TINYINT         NOT NULL                    COMMENT '状态：0-正常、1-停用',
    `remark`            VARCHAR(500)    DEFAULT NULL                COMMENT '备注',
    `add_time`          DATETIME        NOT NULL                    COMMENT '新增时间',
    `update_time`       DATETIME        NOT NULL                    COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `i_type` (`key`) USING BTREE
) ENGINE = InnoDB
    DEFAULT CHARSET = utf8mb4;

-- 3、日志表
CREATE TABLE `xxl_ai_log`
(
    `id`            BIGINT          NOT NULL AUTO_INCREMENT      COMMENT '日志ID',
    `type`          INT             NOT NULL                     COMMENT '日志类型（如操作日志、登陆日志）',
    `module`        INT             NOT NULL                     COMMENT '系统模块（如用户管理）',
    `title`         VARCHAR(100)     NOT NULL                    COMMENT '日志标题',
    `content`       TEXT            NOT NULL                     COMMENT '日志内容',
    `operator`      VARCHAR(20)     DEFAULT NULL                 COMMENT '操作人',
    `ip`            VARCHAR(50)     DEFAULT NULL                 COMMENT '操作IP',
    `add_time`      DATETIME        NOT NULL                     COMMENT '新增时间',
    `update_time`   DATETIME        NOT NULL                     COMMENT '更新时间',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;


-- ================== for default data ==================

START TRANSACTION;

-- 1、默认用户
INSERT INTO `xxl_ai_user` (`id`, `username`, `password`, `token`, `status`, `role`, `real_name`, `add_time`, `update_time`)
VALUES (1, 'admin', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', '', 0, 'admin', 'XXL', now(), now()),
       (2, 'user', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', '', 0, 'user', 'XXL', now(), now());

-- 2、系统配置
INSERT INTO `xxl_ai_config` (`name`, `key`, `value`, `status`, `remark`, `add_time`, `update_time`)
VALUES ('系统配置-登录验证码启用开关', 'system.login.captcha.enabled', 'true', 0, 'true 开启，false 关闭', now(), now());

-- 3、默认业务空间
INSERT INTO `xxl_ai_space` (`name`, `code`, `status`, `remark`, `add_time`, `update_time`)
VALUES ('默认空间', 'default', 0, '系统默认业务空间', NOW(), NOW());

-- 4、预设供应商（admin 在页面可随时修改 BaseURL/Key）
INSERT INTO `xxl_ai_supplier` (`id`,`space_id`, `name`, `base_url`, `api_key`, `status`, `remark`, `add_time`, `update_time`)
VALUES
    (1, 1, 'OpenCodeGo', 'https://opencode.ai/zen/go/v1', '', 0, 'OpenCode Go模型', NOW(), NOW()),
    (2, 1, 'Deepseek', 'https://api.deepseek.com/v1', '', 0, 'Deepseek 对话模型', NOW(), NOW()),
    (3, 1, '智谱GLM', 'https://open.bigmodel.cn/api/paas/v4', '', 0, '智谱 对话+嵌入模型', NOW(), NOW()),
    (4, 1, 'OpenAI`', 'https://api.openai.com/v1', '', 0, 'OpenAI 对话模型', NOW(), NOW());

-- 5、预设供应商模型
INSERT INTO `xxl_ai_supplier_model` (`supplier_id`, `name`, `model`, `type`, `status`, `add_time`, `update_time`)
VALUES
    (1, 'DeepSeek V4 Flash', 'deepseek-v4-flash', 0, 0, NOW(), NOW()),
    (1, 'MiMo-V2.5', 'mimo-v2.5', 0, 0, NOW(), NOW()),
    (2, 'Deepseek Chat', 'deepseek-chat', 0, 0, NOW(), NOW()),
    (2, 'Deepseek Reasoner', 'deepseek-reasoner', 0, 0, NOW(), NOW()),
    (3, 'GLM-4-Flash', 'glm-4-flash', 0, 0, NOW(), NOW()),
    (3, 'GLM-4-Plus', 'glm-4-plus', 0, 0, NOW(), NOW()),
    (3, 'GLM-4-Air', 'glm-4-air', 0, 0, NOW(), NOW()),
    (3, 'Embedding-3', 'embedding-3', 1, 0, NOW(), NOW());

-- 6、社区查询配置（框架配置）
INSERT INTO `xxl_ai_config` (`name`, `key`, `value`, `status`, `remark`, `add_time`, `update_time`)
VALUES ('MCP社区地址', 'system.mcp.community.url', 'https://registry.mcp.so/api', 0, 'MCP 社区检索接口地址，不可达时前端友好降级', NOW(), NOW()),
       ('Skill社区地址', 'system.skill.community.url', '', 0, 'Skill 社区检索接口地址，可配置为空则禁用社区查询', NOW(), NOW());

-- 7、预设 MCP 服务（覆盖 Streamable HTTP 与 stdio 本地进程两类，stdio 需宿主已安装 Node/npx 环境）
--    注意：stdio 类以宿主进程方式运行，命令涉及本机执行请确认信任后再启用
INSERT INTO `xxl_ai_mcp` (`space_id`, `name`, `type`, `url`, `headers`, `config`, `description`, `source`, `source_url`, `status`, `add_time`, `update_time`)
VALUES
    (1, 'Fetch 网页抓取', 0, 'https://mcp.genez.io/fetch', NULL,
     '{"transport":"http","url":"https://mcp.genez.io/fetch","headers":{}}',
     '网页抓取与内容提取（公共托管，无需鉴权）', 'community', 'https://mcp.so/', 0, NOW(), NOW()),
    (1, 'GitHub 代码与仓库', 2, NULL, NULL,
     '{"transport":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-github"],"env":{}}',
     'GitHub 仓库/PR/Issue 管理（需在 env 配置 GITHUB_TOKEN 后可使用）', 'community', 'https://mcp.so/', 0, NOW(), NOW()),
    (1, 'Filesystem 文件系统', 2, NULL, NULL,
     '{"transport":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/tmp"],"env":{}}',
     '本地文件系统读写（请按需调整授权目录参数）', 'community', 'https://mcp.so/', 0, NOW(), NOW()),
    (1, 'Memory 知识图谱记忆', 2, NULL, NULL,
     '{"transport":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-memory"],"env":{}}',
     '跨会话知识图谱记忆', 'community', 'https://mcp.so/', 0, NOW(), NOW()),
    (1, 'Everything 全工具集', 2, NULL, NULL,
     '{"transport":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-everything"],"env":{}}',
     'MCP 全工具集（演示/联调用）', 'community', 'https://mcp.so/', 0, NOW(), NOW());

COMMIT;
