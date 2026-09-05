package com.xxl.ai.api.business.supplier.model.dto;

/**
 * 远程模型 展示DTO（自动导入：拉取供应商 OpenAI 兼容 /models 接口结果）
 *
 * @author xxl-ai 2026-09-05
 */
public class RemoteModelDTO {

    private String modelId;     /* 远程模型标识 */
    private boolean imported;   /* 是否已导入当前供应商 */

    public String getModelId() {
        return modelId;
    }

    public void setModelId(String modelId) {
        this.modelId = modelId;
    }

    public boolean isImported() {
        return imported;
    }

    public void setImported(boolean imported) {
        this.imported = imported;
    }

}