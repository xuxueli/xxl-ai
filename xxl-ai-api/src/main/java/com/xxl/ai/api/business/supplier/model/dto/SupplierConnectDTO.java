package com.xxl.ai.api.business.supplier.model.dto;

/**
 * 供应商连通测试结果 DTO
 *
 * @author xxl-ai 2026-09-06
 */
public class SupplierConnectDTO {

    private boolean connectable;    /* 是否连通 */
    private int httpCode;           /* 最近一次请求 HTTP 状态码（0 表示网络异常未收到响应） */
    private long elapsedMs;         /* 测试耗时（毫秒） */
    private String message;         /* 测试过程描述 */

    public boolean isConnectable() {
        return connectable;
    }

    public void setConnectable(boolean connectable) {
        this.connectable = connectable;
    }

    public int getHttpCode() {
        return httpCode;
    }

    public void setHttpCode(int httpCode) {
        this.httpCode = httpCode;
    }

    public long getElapsedMs() {
        return elapsedMs;
    }

    public void setElapsedMs(long elapsedMs) {
        this.elapsedMs = elapsedMs;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

}