SET NAMES utf8mb4;

-- ==================== AI 业务中台：建表脚本 ====================
-- 包含：空间、用户-空间、供应商、供应商模型、MCP、Skill、知识库、知识文档、Agent、Agent对话、Agent消息

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
  `type` TINYINT NOT NULL DEFAULT 0 COMMENT '协议类型：0-Streamable HTTP、1-SSE',
  `url` VARCHAR(200) NOT NULL COMMENT '服务地址',
  `headers` VARCHAR(500) NULL DEFAULT NULL COMMENT '请求头(JSON)',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent消息表';