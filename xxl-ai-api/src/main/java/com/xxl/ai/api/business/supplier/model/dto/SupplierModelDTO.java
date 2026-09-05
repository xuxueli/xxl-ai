package com.xxl.ai.api.business.supplier.model.dto;

/**
 * 供应商模型 展示DTO
 *
 * @author xxl-ai 2026-09-05
 */
public class SupplierModelDTO {

    private long id;            /* 模型ID */
    private long supplierId;    /* 供应商ID */
    private String name;        /* 模型展示名称 */
    private String model;       /* 模型标识 */
    private int type;           /* 类型：0-对话、1-嵌入 */
    private int status;         /* 状态：0-正常、1-停用 */

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public long getSupplierId() {
        return supplierId;
    }

    public void setSupplierId(long supplierId) {
        this.supplierId = supplierId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public int getType() {
        return type;
    }

    public void setType(int type) {
        this.type = type;
    }

    public int getStatus() {
        return status;
    }

    public void setStatus(int status) {
        this.status = status;
    }

}