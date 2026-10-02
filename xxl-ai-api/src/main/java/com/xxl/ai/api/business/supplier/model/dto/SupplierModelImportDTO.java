package com.xxl.ai.api.business.supplier.model.dto;

import java.util.List;

/**
 * 供应商模型 导入DTO（批量导入远程模型请求体）
 *
 * @author xxl-ai 2026-10-02
 */
public class SupplierModelImportDTO {

    private long supplierId;        /* 供应商ID */
    private List<String> models;    /* 待导入的远程模型标识集合 */

    public long getSupplierId() {
        return supplierId;
    }

    public void setSupplierId(long supplierId) {
        this.supplierId = supplierId;
    }

    public List<String> getModels() {
        return models;
    }

    public void setModels(List<String> models) {
        this.models = models;
    }

}
