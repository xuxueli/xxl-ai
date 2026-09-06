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
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0-正常、1-停用',
    `remark` VARCHAR(500) NULL DEFAULT NULL COMMENT '备注',
    `add_time` DATETIME NOT NULL COMMENT '新增时间',
    `update_time` DATETIME NOT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `i_space_id` (`space_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='MCP服务表';

-- 6、SKILL 表（重设计：移除 content/source/source_url；名称空间内唯一）
CREATE TABLE IF NOT EXISTS `xxl_ai_skill` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `space_id` BIGINT NOT NULL COMMENT '空间ID',
    `name` VARCHAR(100) NOT NULL COMMENT 'SKILL名称(目录名，空间内唯一)',
    `description` VARCHAR(500) NULL DEFAULT NULL COMMENT 'SKILL描述',
    `version` VARCHAR(20) NOT NULL DEFAULT '1.0' COMMENT '版本',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '状态：0-正常、1-停用',
    `add_time` DATETIME NOT NULL COMMENT '新增时间',
    `update_time` DATETIME NOT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `i_space_id_name` (`space_id`, `name`),
    KEY `i_space_id` (`space_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SKILL表';

-- 6-1、SKILL 内容文件表（文件树，parent_id 父子层级；locked 固定文件仅 SKILL.md 与约定目录）
CREATE TABLE IF NOT EXISTS `xxl_ai_skill_file` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `skill_id` BIGINT NOT NULL COMMENT 'SKILL ID',
    `parent_id` BIGINT NOT NULL DEFAULT 0 COMMENT '父目录ID(0为根级)',
    `name` VARCHAR(200) NOT NULL COMMENT '文件/目录名称',
    `type` TINYINT NOT NULL DEFAULT 1 COMMENT '类型：0-目录、1-文件',
    `file_type` VARCHAR(20) NULL DEFAULT NULL COMMENT '文件类型(扩展名，目录为空)',
    `content` MEDIUMTEXT NULL COMMENT '文件内容(目录为空)',
    `locked` TINYINT NOT NULL DEFAULT 0 COMMENT '是否固定：0-否、1-是(不可删除/改名/移动)',
    `sort` INT NOT NULL DEFAULT 0 COMMENT '排序',
    `add_time` DATETIME NOT NULL COMMENT '新增时间',
    `update_time` DATETIME NOT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `i_skill_parent_name` (`skill_id`, `parent_id`, `name`),
    KEY `i_skill_id` (`skill_id`),
    KEY `i_parent_id` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SKILL内容文件表';

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
    `content` MEDIUMTEXT NULL COMMENT '文档内容',
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
    (2, 1, 'Ollama', 'http://127.0.0.1:11434', '', 0, 'Ollama 模型', NOW(), NOW()),
    (3, 1, 'Deepseek', 'https://api.deepseek.com/v1', '', 0, 'Deepseek 模型', NOW(), NOW()),
    (4, 1, '智谱GLM', 'https://open.bigmodel.cn/api/paas/v4', '', 0, '智谱 模型', NOW(), NOW());

-- 5、预设供应商模型
INSERT INTO `xxl_ai_supplier_model` (`supplier_id`, `name`, `model`, `type`, `status`, `add_time`, `update_time`)
VALUES
    (1, 'DeepSeek V4 Flash', 'deepseek-v4-flash', 0, 0, NOW(), NOW()),
    (1, 'MiMo-V2.5', 'mimo-v2.5', 0, 0, NOW(), NOW()),
    (2, 'Qwen-Embedding-0.8B', 'qwen3-embedding:0.6b', 0, 0, NOW(), NOW()),
    (2, 'Qwen3.5-0.8B', 'qwen3.5:0.8b', 0, 0, NOW(), NOW()),
    (2, 'Qwen3.5-4B', 'qwen3.5:4b', 0, 0, NOW(), NOW()),
    (3, 'Deepseek Chat', 'deepseek-chat', 0, 0, NOW(), NOW()),
    (3, 'Deepseek Reasoner', 'deepseek-reasoner', 0, 0, NOW(), NOW()),
    (4, 'GLM-4-Flash', 'glm-4-flash', 0, 0, NOW(), NOW()),
    (4, 'GLM-4-Plus', 'glm-4-plus', 0, 0, NOW(), NOW()),
    (4, 'GLM-4-Air', 'glm-4-air', 0, 0, NOW(), NOW()),
    (4, 'Embedding-3', 'embedding-3', 1, 0, NOW(), NOW());

-- 6、社区查询配置（框架配置）
INSERT INTO `xxl_ai_config` (`name`, `key`, `value`, `status`, `remark`, `add_time`, `update_time`)
VALUES ('Skill社区地址', 'system.skill.community.url', '', 0, 'Skill 社区检索接口地址，可配置为空则禁用社区查询', NOW(), NOW());

-- 7、预设 MCP 服务（覆盖 Streamable HTTP / SSE / stdio 三类，作为「连接测试」联调用例）
INSERT INTO `xxl_ai_mcp` (`space_id`, `name`, `type`, `url`, `headers`, `config`, `status`, `remark`, `add_time`, `update_time`)
VALUES
    -- 远程 MCP（本地mock）
    (1, '本地时钟服务', 0, 'http://127.0.0.1:19001/mcp', null, '{"transport":"http","url":"http://127.0.0.1:19001/mcp","headers":{}}', 0, '内置测试：get_current_time', NOW(), NOW()),
    (1, '计算器服务', 0, 'http://127.0.0.1:19003/mcp', null, '{"transport":"http","url":"http://127.0.0.1:19003/mcp","headers":{}}', 0, '内置测试：calculator', NOW(), NOW()),
    (1, '天气查询服务', 1, 'http://127.0.0.1:19002/mcp', null, '{"transport":"sse","url":"http://127.0.0.1:19002/mcp","headers":{}}', 0, '内置测试：get_weather', NOW(), NOW()),
    (1, '日志信息查询', 1, 'http://127.0.0.1:19004/mcp', null, '{"transport":"sse","url":"http://127.0.0.1:19004/mcp","headers":{}}', 0, '内置测试：query_logs', NOW(), NOW()),
    -- 本地 MCP（本地mock）
    (1, '系统信息查询', 2, null, null, '{"transport":"stdio","command":"node","args":["/Users/admin/program/git-space/github/xxl-ai/xxl-ai-spec/20260906-mcp/mock-server/mcp-stdio-mock.mjs","system"],"env":{}}', 0, '内置测试：get_system_info（本地stdio mock）', NOW(), NOW()),
    (1, '随机数生成', 2, null, null, '{"transport":"stdio","command":"node","args":["/Users/admin/program/git-space/github/xxl-ai/xxl-ai-spec/20260906-mcp/mock-server/mcp-stdio-mock.mjs","random"],"env":{}}', 0, '内置测试：random_number（本地stdio mock）', NOW(), NOW()),
    -- 社区流行MCP（stdio 本地进程）
    (1, 'GitHub 代码与仓库', 2, null, null, '{"transport":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-github"],"env":{}}', 0, 'GitHub 仓库/PR/Issue 管理（需在 env 配置 GITHUB_TOKEN 后可使用）', NOW(), NOW()),
    (1, 'Fetch 网页抓取', 2, null, null, '{"transport":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-fetch"],"env":{}}', 0, '网页抓取与内容提取', NOW(), NOW()),
    (1, 'Filesystem 文件系统', 2, null, null, '{"transport":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/tmp"],"env":{}}', 0, '本地文件系统读写（请按需调整授权目录参数）', NOW(), NOW()),
    (1, 'Memory 知识图谱记忆', 2, null, null, '{"transport":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-memory"],"env":{}}', 0, '跨会话知识图谱记忆', NOW(), NOW()),
    (1, 'Everything 全工具集', 2, null, null, '{"transport":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-everything"],"env":{}}', 0, 'MCP 全工具集（演示/联调用）', NOW(), NOW());

-- 8、预设 SKILL（开箱即用：code-review 代码审查、docx 文档生成）
INSERT INTO `xxl_ai_skill` (`id`, `space_id`, `name`, `description`, `version`, `status`, `add_time`, `update_time`)
VALUES
    (1, 1, 'code-review', '代码审查 Skill：按安全/性能/可维护性清单对代码变更做结构化审查，输出分级评审意见（P0 阻断/P1 需改/P2 建议）', '1.0', 0, NOW(), NOW()),
    (2, 1, 'docx', '文档生成 Skill：基于 python-docx 将结构化内容输出为排版规范的 .docx 文档，供业务交付使用', '1.0', 0, NOW(), NOW());

-- 8-1、预设 SKILL 固定文件树（SKILL.md + scripts/ + reference/ 为锁定骨架，与新增播种结构一致）
INSERT INTO `xxl_ai_skill_file` (`skill_id`, `parent_id`, `name`, `type`, `file_type`, `content`, `locked`, `sort`, `add_time`, `update_time`)
VALUES
    -- code-review：骨架（锁定）
    (1, 0, 'SKILL.md', 1, 'md', CONCAT('---\n', 'name: code-review\n', 'description: 代码审查，按安全/性能/可维护性清单审查代码变更并输出分级意见\n', '---\n', '\n', '# code-review\n', '\n', '对代码变更（PR/DIFF）执行结构化审查，输出按严重级别分级的评审意见。\n', '\n', '## 使用方式\n', '1. 获取变更范围与关联文件。\n', '2. 查阅 reference/security-checklist.md 与 reference/review-template.md。\n', '3. 逐文件按清单检查，记录问题级别（P0 阻断 / P1 需修改 / P2 建议）。\n', '4. 汇总输出评审报告，可借助 scripts/review-report.py 生成 Markdown 报告。\n', '\n', '## 目录说明\n', '- SKILL.md：入口与流程说明\n', '- scripts/：评审报告生成脚本\n', '- reference/：检查清单与报告模板'), 1, 1, NOW(), NOW()),
    (1, 0, 'scripts', 0, NULL, NULL, 1, 2, NOW(), NOW()),
    (1, 0, 'reference', 0, NULL, NULL, 1, 3, NOW(), NOW()),
    -- code-review：子级
    ( 1, 2, 'review-report.py', 1, 'py', CONCAT('#!/usr/bin/env python3\n', '"""基于 JSON 输入的问题列表生成分级审查报告（Markdown）。"""\n', 'import json\n', 'import sys\n', '\n', 'def main():\n', '    items = json.load(sys.stdin)\n', '    for item in items:\n', '        level = item.get("level", "P2")\n', '        print("- [{}] {}: {}".format(level, item.get("file", ""), item.get("msg", "")))\n', '\n', 'if __name__ == "__main__":\n', '    main()'), 0, 1, NOW(), NOW()),
    ( 1, 3, 'security-checklist.md', 1, 'md', CONCAT('# 安全检查清单\n', '\n', '- 注入：SQL/命令/模板注入是否被正确转义或参数化\n', '- 敏感信息：日志、错误信息中是否泄露密钥、Token、个人数据\n', '- 输入校验：越权、越界、特殊字符是否被拦截\n', '- 认证授权：接口是否有鉴权，越权访问是否可被阻断\n', '- 依赖安全：引入的依赖版本是否有已知漏洞'), 0, 1, NOW(), NOW()),
    ( 1, 3, 'review-template.md', 1, 'md', CONCAT('# 代码审查报告\n', '\n', '## 变更范围\n', '## 评审结论（通过 / 有条件通过 / 拒绝）\n', '## 问题列表\n', '| 级别 | 文件 | 行号 | 问题描述 | 建议 |\n', '## 其他建议'), 0, 2, NOW(), NOW()),
    -- docx：骨架（锁定）
    (2, 0, 'SKILL.md', 1, 'md', CONCAT('---\n', 'name: docx\n', 'description: 文档生成，基于 python-docx 一键生成排版规范的 .docx 文档\n', '---\n', '\n', '# docx\n', '\n', '生成 Word 文档：内容结构化输入，输出排版规范（标题/表格/样式）的 .docx 文件。\n', '\n', '## 使用方式\n', '1. 在 scripts/ 目录安装依赖：pip install -r requirements.txt。\n', '2. 参照 scripts/docx.py 提供的辅助函数组织文档内容（标题/段落/表格/分页）。\n', '3. 生成结果以 .docx 落盘，供业务交付使用。\n', '\n', '## 目录说明\n', '- SKILL.md：入口与使用说明\n', '- scripts/：python-docx 封装脚本与依赖清单\n', '- reference/：样式与排版参考'), 1, 1, NOW(), NOW()),
    (2, 0, 'scripts', 0, NULL, NULL, 1, 2, NOW(), NOW()),
    (2, 0, 'reference', 0, NULL, NULL, 1, 3, NOW(), NOW()),
    -- docx：子级
    ( 2, 8, 'docx.py', 1, 'py', CONCAT('"""python-docx 文档生成封装：标题/段落/表格统一样式。"""\n', 'from docx import Document\n', '\n', 'def build(title, paragraphs, table=None):\n', '    doc = Document()\n', '    doc.add_heading(title, level=0)\n', '    for para in paragraphs:\n', '        p = doc.add_paragraph(para["text"])\n', '        if para.get("bold"):\n', '            p.runs[0].bold = True\n', '    if table:\n', '        t = doc.add_table(rows=len(table), cols=len(table[0]))\n', '        for i, row in enumerate(table):\n', '            for j, cell in enumerate(row):\n', '                t.cell(i, j).text = str(cell)\n', '    return doc\n', '\n', 'def save(doc, path):\n', '    doc.save(path)'), 0, 1, NOW(), NOW()),
    ( 2, 8, 'requirements.txt', 1, 'txt', 'python-docx>=1.1.0', 0, 2, NOW(), NOW()),
    ( 2, 9, 'style-guide.md', 1, 'md', CONCAT('# 排版规范参考\n', '\n', '- 一级标题使用 Heading 0/1，正文 12pt 宋体\n', '- 表格使用简洁网格样式，表头加粗\n', '- 长文档使用分页符控制章节边界\n', '- 文件命名：{主题}-{yyyyMMdd}.docx'), 0, 1, NOW(), NOW());


COMMIT;
