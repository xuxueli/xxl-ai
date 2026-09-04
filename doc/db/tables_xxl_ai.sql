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
    `role`          VARCHAR(20)     NOT NULL DEFAULT 'user'      COMMENT '角色编码：admin-管理员、user-普通用户',
    `real_name`     VARCHAR(50)     DEFAULT NULL                 COMMENT '真实姓名',
    `email`         VARCHAR(100)    DEFAULT NULL                 COMMENT '邮箱',
    `add_time`      DATETIME        NOT NULL                     COMMENT '新增时间',
    `update_time`   DATETIME        NOT NULL                     COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `i_username` (`username`) USING BTREE
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

INSERT INTO `xxl_ai_user` (`id`, `username`, `password`, `token`, `status`, `role`, `real_name`, `add_time`, `update_time`)
VALUES (1, 'admin', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', '', 0, 'admin', 'XXL', now(), now()),
       (2, 'user', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', '', 0, 'user', 'XXL', now(), now());

INSERT INTO `xxl_ai_config` (`name`, `key`, `value`, `status`, `remark`, `add_time`, `update_time`)
VALUES ('系统配置-登录验证码启用开关', 'system.login.captcha.enabled', 'true', 0, 'true 开启，false 关闭', now(), now());


COMMIT;
