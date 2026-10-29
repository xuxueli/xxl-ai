-- --------------------------------------------------
-- XXL-AI 全链路可观测性增量升级脚本 (v1.4.1+)
-- 适用场景：存量数据库平滑升级（无需重建表或清空数据）
-- --------------------------------------------------

-- 1、消息表扩展可观测数据字段（ext_json）
ALTER TABLE `xxl_ai_session_msg`
    ADD COLUMN `ext_json` MEDIUMTEXT DEFAULT NULL COMMENT '扩展可观测数据(JSON：Run状态机/Token统计/耗时瀑布Span/工具调用证据链/RAG引用/执行日志)' AFTER `reasoning`;
