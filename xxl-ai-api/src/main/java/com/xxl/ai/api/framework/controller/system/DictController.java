package com.xxl.ai.api.framework.controller.system;

import com.xxl.sso.core.annotation.XxlSso;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.EnumTool;
import com.xxl.tool.response.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AssignableTypeFilter;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

/**
 * 字典、枚举查询 Controller（仅保留枚举下拉能力，字典管理功能已下线）
 *
 * @author xuxueli 2024-11-03
 */
@RestController
@RequestMapping("/system/dict")
public class DictController {
    private static final Logger logger = LoggerFactory.getLogger(DictController.class);

    /**
     * 按枚举Name查询枚举项数据（供页面下拉、单选等使用）
     *
     * @param enumName 枚举类名
     */
    @RequestMapping("/loadEnumItem")
    @XxlSso
    public Response<List<EnumTool.EnumItemVO>> loadEnum(String enumName) {
        // 动态收集平台包 + 业务枚举包
        List<EnumTool.EnumItemVO> list = EnumTool.getEnumItemList(businessEnumPackages(), enumName);
        return CollectionTool.isNotEmpty(list) ?
                Response.ofSuccess(list) :
                Response.ofFail("枚举不存在: " + enumName);
    }

    /**
     * 业务模块根包：业务枚举随动态 module 落位（business/任意子包），动态扫描收集
     */
    private static final String BIZ_ROOT_PACKAGE = "com.xxl.ai";

    /**
     * 业务枚举包列表缓存：business 根包下「包含 IEnum 枚举」的包名
     */
    private static volatile List<String> bizEnumPackageList;

    /**
     * 动态收集业务枚举包：扫描 business 根包内实现 EnumTool.IEnum 的枚举，收集其所在包，
     * 一次扫描后缓存，命中与未命中都走缓存，避免反复全包扫描。
     */
    private static List<String> businessEnumPackages() {
        if (bizEnumPackageList != null) {
            return bizEnumPackageList;
        }
        synchronized (DictController.class) {
            if (bizEnumPackageList == null) {
                List<String> packageList = new ArrayList<>();
                ClassPathScanningCandidateComponentProvider scanner =
                        new ClassPathScanningCandidateComponentProvider(false);
                scanner.addIncludeFilter(new AssignableTypeFilter(EnumTool.IEnum.class));
                for (BeanDefinition beanDefinition : scanner.findCandidateComponents(BIZ_ROOT_PACKAGE)) {
                    try {
                        Class<?> clazz = Class.forName(beanDefinition.getBeanClassName());
                        if (clazz.isEnum() && EnumTool.IEnum.class.isAssignableFrom(clazz)) {
                            String enumPackage = clazz.getPackage().getName();
                            if (!packageList.contains(enumPackage)) {
                                packageList.add(enumPackage);
                            }
                        }
                    } catch (ClassNotFoundException ignored) {
                        logger.debug("DictController.businessEnumPackages error, class invalid:{}", BIZ_ROOT_PACKAGE, ignored);
                    }
                }
                logger.info("DictController scanned business enum packages, count={}, packages={}",
                        packageList.size(), packageList);
                bizEnumPackageList = packageList;
            }
        }
        return bizEnumPackageList;
    }

}