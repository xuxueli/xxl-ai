package com.xxl.ai.api.business.supplier.mapper;

import com.xxl.ai.api.business.supplier.model.entity.SupplierModel;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 供应商模型 Mapper
 *
 * @author xxl-ai 2026-09-05
 */
@Mapper
public interface SupplierModelMapper {

    int insert(SupplierModel supplierModel);

    int delete(@Param("id") long id);

    int deleteByIds(@Param("ids") List<Long> ids);

    int deleteBySupplierId(@Param("supplierId") long supplierId);

    int update(SupplierModel supplierModel);

    SupplierModel load(@Param("id") long id);

    List<SupplierModel> listBySupplier(@Param("supplierId") long supplierId);

    List<SupplierModel> pageList(@Param("supplierId") long supplierId,
                                 @Param("offset") int offset,
                                 @Param("pagesize") int pagesize,
                                 @Param("name") String name,
                                 @Param("type") int type);

    int pageListCount(@Param("supplierId") long supplierId,
                      @Param("offset") int offset,
                      @Param("pagesize") int pagesize,
                      @Param("name") String name,
                      @Param("type") int type);

}