package com.xxl.ai.api.business.supplier.model.adaptor;

import com.xxl.ai.api.business.supplier.model.dto.SupplierDTO;
import com.xxl.ai.api.business.supplier.model.entity.Supplier;
import com.xxl.tool.core.DateTool;

import java.util.ArrayList;
import java.util.List;

/**
 * 供应商 适配器（实体 ↔ DTO 互转）
 *
 * @author xxl-ai 2026-09-05
 */
public class SupplierAdaptor {

    /**
     * DTO 转实体（新增/修改入参）
     */
    public static Supplier adapt(SupplierDTO dto) {
        if (dto == null) {
            return null;
        }
        Supplier supplier = new Supplier();
        supplier.setId(dto.getId());
        supplier.setSpaceId(dto.getSpaceId());
        supplier.setName(dto.getName());
        supplier.setCode(dto.getCode());
        supplier.setType(dto.getType());
        supplier.setBaseUrl(dto.getBaseUrl());
        supplier.setApiKey(dto.getApiKey());
        supplier.setStatus(dto.getStatus());
        supplier.setRemark(dto.getRemark());
        return supplier;
    }

    /**
     * 实体转 DTO（时间格式化为字符串）
     */
    public static SupplierDTO adapt2dto(Supplier supplier) {
        if (supplier == null) {
            return null;
        }
        SupplierDTO dto = new SupplierDTO();
        dto.setId(supplier.getId());
        dto.setSpaceId(supplier.getSpaceId());
        dto.setName(supplier.getName());
        dto.setCode(supplier.getCode());
        dto.setType(supplier.getType());
        dto.setBaseUrl(supplier.getBaseUrl());
        dto.setApiKey(supplier.getApiKey());
        dto.setStatus(supplier.getStatus());
        dto.setRemark(supplier.getRemark());
        dto.setAddTime(DateTool.formatDateTime(supplier.getAddTime()));
        dto.setUpdateTime(DateTool.formatDateTime(supplier.getUpdateTime()));
        return dto;
    }

    /**
     * 实体列表转 DTO 列表
     */
    public static List<SupplierDTO> adapt2dto(List<Supplier> supplierList) {
        List<SupplierDTO> dtoList = new ArrayList<>();
        if (supplierList != null) {
            for (Supplier supplier : supplierList) {
                dtoList.add(adapt2dto(supplier));
            }
        }
        return dtoList;
    }

}