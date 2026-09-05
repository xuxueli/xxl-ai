package com.xxl.ai.api.business.supplier.model;

/**
 * 供应商模型运行时配置
 *
 * 供 Agent 对话、知识库向量化（嵌入）运行时解析供应商连接参数
 *
 * @author xxl-ai 2026-09-05
 */
public class SupplierRuntime {

    private long supplierId;    /* 供应商ID */
    private String supplierName; /* 供应商名称 */
    private long modelId;       /* 模型ID */
    private String modelName;   /* 模型标识 */
    private String baseUrl;     /* 接口地址 */
    private String apiKey;      /* API密钥 */
    private int modelType;      /* 模型类型：0-对话、1-嵌入 */

    public long getSupplierId() {
        return supplierId;
    }

    public void setSupplierId(long supplierId) {
        this.supplierId = supplierId;
    }

    public String getSupplierName() {
        return supplierName;
    }

    public void setSupplierName(String supplierName) {
        this.supplierName = supplierName;
    }

    public long getModelId() {
        return modelId;
    }

    public void setModelId(long modelId) {
        this.modelId = modelId;
    }

    public String getModelName() {
        return modelName;
    }

    public void setModelName(String modelName) {
        this.modelName = modelName;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public int getModelType() {
        return modelType;
    }

    public void setModelType(int modelType) {
        this.modelType = modelType;
    }

}