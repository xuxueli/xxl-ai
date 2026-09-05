package com.xxl.ai.api.business.supplier.mapper;

import com.xxl.ai.api.business.supplier.model.entity.Supplier;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 供应商 Mapper
 *
 * @author xxl-ai 2026-09-05
 */
@Mapper
public interface SupplierMapper {

    int insert(Supplier supplier);

    int delete(@Param("id") long id);

    int deleteByIds(@Param("ids") List<Long> ids);

    int update(Supplier supplier);

    Supplier load(@Param("id") long id);

    List<Supplier> listBySpace(@Param("spaceId") long spaceId);

    List<Supplier> pageList(@Param("spaceId") long spaceId,
                            @Param("offset") int offset,
                            @Param("pagesize") int pagesize,
                            @Param("name") String name,
                            @Param("status") int status);

    int pageListCount(@Param("spaceId") long spaceId,
                      @Param("offset") int offset,
                      @Param("pagesize") int pagesize,
                      @Param("name") String name,
                      @Param("status") int status);

}