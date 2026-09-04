--
-- XXL-AI
-- Copyright (c) 2015-present, xuxueli.

CREATE DATABASE IF NOT EXISTS `xxl_ai` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `xxl_ai`;
SET NAMES utf8mb4;

-- ================== user and auth ==================

CREATE TABLE `xxl_ai_user`
(
    `id`            INT             NOT NULL AUTO_INCREMENT      COMMENT '用户ID',
    `username`      VARCHAR(50)     NOT NULL                     COMMENT '账号',
    `password`      VARCHAR(100)    NOT NULL                     COMMENT '密码加密信息',
    `token`         VARCHAR(100)    DEFAULT NULL                 COMMENT '登录token',
    `status`        TINYINT         NOT NULL                     COMMENT '状态：0-正常、1-禁用',
    `real_name`     VARCHAR(50)     DEFAULT NULL                 COMMENT '真实姓名',
    `email`         VARCHAR(100)    DEFAULT NULL                 COMMENT '邮箱',
    `phone`         VARCHAR(20)     DEFAULT NULL                 COMMENT '手机号码',
    `add_time`      DATETIME        NOT NULL                     COMMENT '新增时间',
    `update_time`   DATETIME        NOT NULL                     COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `i_username` (`username`) USING BTREE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;

CREATE TABLE `xxl_ai_role`
(
    `id`            INT             NOT NULL AUTO_INCREMENT      COMMENT '角色ID',
    `name`          VARCHAR(50)     NOT NULL                     COMMENT '角色名称',
    `code`          VARCHAR(50)     NOT NULL                     COMMENT '角色标识',
    `status`        TINYINT         NOT NULL                     COMMENT '状态：0-正常、1-禁用',
    `order`         INT             NOT NULL                     COMMENT '顺序',
    `add_time`      DATETIME        NOT NULL                     COMMENT '新增时间',
    `update_time`   DATETIME        NOT NULL                     COMMENT '更新时间',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;

CREATE TABLE `xxl_ai_resource`
(
    `id`            INT             NOT NULL AUTO_INCREMENT      COMMENT '资源ID',
    `parent_id`     INT             NOT NULL                     COMMENT '父节点ID',
    `name`          VARCHAR(50)     NOT NULL                     COMMENT '名称',
    `type`          TINYINT         NOT NULL                     COMMENT '类型',
    `permission`    VARCHAR(50)     DEFAULT NULL                 COMMENT '权限标识',
    `url`           VARCHAR(50)     DEFAULT NULL                 COMMENT '菜单地址',
    `icon`          VARCHAR(50)     DEFAULT NULL                 COMMENT '资源icon',
    `order`         INT             NOT NULL                     COMMENT '顺序',
    `status`        TINYINT         NOT NULL                     COMMENT '状态：0-正常、1-禁用',
    `visible`       TINYINT         NOT NULL                     COMMENT '显示状态：0-显示、1-隐藏',
    `add_time`      DATETIME        NOT NULL                     COMMENT '新增时间',
    `update_time`   DATETIME        NOT NULL                     COMMENT '更新时间',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;

CREATE TABLE `xxl_ai_user_role`
(
    `id`            INT             NOT NULL AUTO_INCREMENT,
    `user_id`       INT             NOT NULL,
    `role_id`       INT             NOT NULL,
    `add_time`      DATETIME        NOT NULL                     COMMENT '新增时间',
    `update_time`   DATETIME        NOT NULL                     COMMENT '更新时间',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;

CREATE TABLE `xxl_ai_role_res`
(
    `id`            INT             NOT NULL AUTO_INCREMENT,
    `role_id`       INT             NOT NULL,
    `res_id`        INT             NOT NULL,
    `add_time`      DATETIME        NOT NULL                     COMMENT '新增时间',
    `update_time`   DATETIME        NOT NULL                     COMMENT '更新时间',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;


-- ================== system：config、log ==================

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

INSERT INTO `xxl_ai_user` (`id`, `username`, `password`, `token`, `status`, `real_name`, `add_time`, `update_time`)
VALUES (1, 'admin', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', '', 0, '吴彦祖', now(), now()),
       (2, 'user', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', '', 0, '张三', now(), now());

INSERT INTO `xxl_ai_role` (`id`, `name`, `code`, `status`, `order`, `add_time`, `update_time`)
VALUES (1, '管理员', 'admin', 0, 1, now(), now()),
       (2, '普通用户', 'user', 0, 2, now(), now());

INSERT INTO `xxl_ai_user_role` (`id`, `user_id`, `role_id`, `add_time`, `update_time`)
VALUES (1, 1, 1, now(), now()),
       (2, 2, 2, now(), now());

INSERT INTO `xxl_ai_resource` (`id`, `parent_id`, `name`, `type`, `permission`, `url`, `icon`, `order`, `status`, `visible`, `add_time`, `update_time`)
VALUES (1, 0, '首页', 1, 'dashboard', '/dashboard', 'dashboard', 100, 0, 0, now(), now()),
       (2, 0, '权限管理', 0, 'authz', '/authz', 'monitor', 900, 0, 0, now(), now()),
       (3, 2, '用户管理', 1, 'authz:user', '/authz/user', 'user', 901, 0, 0, now(), now()),
       (4, 2, '角色管理', 1, 'authz:role', '/authz/role', 'peoples', 902, 0, 0, now(), now()),
       (5, 2, '资源管理', 1, 'authz:resource', '/authz/resource', 'tree-table', 903, 0, 0, now(), now()),
       (7, 0, '系统管理', 0, 'system', '/system', 'system', 910, 0, 0, now(), now()),
       (10, 7, '配置管理', 1, 'system:config', '/system/config', 'edit', 912, 0, 0, now(), now()),
       (12, 7, '审计日志', 1, 'system:log', '/system/log', 'log', 914, 0, 0, now(), now()),
       (16, 0, '帮助中心', 1, 'help', '/help', 'guide', 930, 0, 0, now(), now());

INSERT INTO `xxl_ai_role_res` (`role_id`, `res_id`, `add_time`, `update_time`)
VALUES (1, 1, now(), now()),
       (1, 2, now(), now()),
       (1, 3, now(), now()),
       (1, 4, now(), now()),
       (1, 5, now(), now()),
       (1, 7, now(), now()),
       (1, 10, now(), now()),
       (1, 12, now(), now()),
       (1, 16, now(), now()),
       (2, 1, now(), now()),
       (2, 16, now(), now());

INSERT INTO `xxl_ai_config` (`name`, `key`, `value`, `status`, `remark`, `add_time`, `update_time`)
VALUES ('系统配置-登录验证码启用开关', 'system.login.captcha.enabled', 'true', 0, 'true 开启，false 关闭', now(), now());


COMMIT;
