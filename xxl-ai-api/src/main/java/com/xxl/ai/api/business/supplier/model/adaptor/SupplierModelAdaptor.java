package com.xxl.ai.api.business.supplier.model.adaptor;

import com.xxl.ai.api.business.supplier.model.dto.SupplierModelDTO;
import com.xxl.ai.api.business.supplier.model.entity.SupplierModel;

import java.util.ArrayList;
import java.util.List;

/**
 * 供应商模型 适配器（实体 ↔ DTO 互转）
 *
 * @author xxl-ai 2026-09-05
 */
public class SupplierModelAdaptor {

    /**
     * DTO 转实体（新增/修改入参）
     */
    public static SupplierModel adapt(SupplierModelDTO dto) {
        if (dto == null) {
            return null;
        }
        SupplierModel supplierModel = new SupplierModel();
        supplierModel.setId(dto.getId());
        supplierModel.setSupplierId(dto.getSupplierId());
        supplierModel.setName(dto.getName());
        supplierModel.setModel(dto.getModel());
        supplierModel.setType(dto.getType());
        supplierModel.setStatus(dto.getStatus());
        return supplierModel;
    }

    /**
     * 实体转 DTO
     */
    public static SupplierModelDTO adapt2dto(SupplierModel supplierModel) {
        if (supplierModel == null) {
            return null;
        }
        SupplierModelDTO dto = new SupplierModelDTO();
        dto.setId(supplierModel.getId());
        dto.setSupplierId(supplierModel.getSupplierId());
        dto.setName(supplierModel.getName());
        dto.setModel(supplierModel.getModel());
        dto.setType(supplierModel.getType());
        dto.setStatus(supplierModel.getStatus());
        return dto;
    }

    /**
     * 实体列表转 DTO 列表
     */
    public static List<SupplierModelDTO> adapt2dto(List<SupplierModel> supplierModelList) {
        List<SupplierModelDTO> dtoList = new ArrayList<>();
        if (supplierModelList != null) {
            for (SupplierModel supplierModel : supplierModelList) {
                dtoList.add(adapt2dto(supplierModel));
            }
        }
        return dtoList;
    }

}