SET NAMES utf8mb4;

-- ============================================================
-- SKILL 管理（重设计）：SKILL 自管理 + 内容文件树管理
-- 1) xxl_ai_skill       SKILL 元信息
-- 2) xxl_ai_skill_file  SKILL 内容文件树（目录 + 文件，文件内容存库）
-- ============================================================

-- 1、SKILL 表（重设计：移除 content/source/source_url；名称空间内唯一）
DROP TABLE IF EXISTS `xxl_ai_skill`;
CREATE TABLE `xxl_ai_skill` (
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

-- 2、SKILL 内容文件表（文件树，parent_id 父子层级，locked 固定文件仅 SKILL.md 与约定目录）
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