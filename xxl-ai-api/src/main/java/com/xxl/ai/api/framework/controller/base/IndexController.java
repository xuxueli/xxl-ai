package com.xxl.ai.api.framework.controller.base;

import com.xxl.ai.api.framework.constant.enums.ResourceTypeEnum;
import com.xxl.ai.api.framework.model.dto.BaseConfigDTO;
import com.xxl.ai.api.framework.model.dto.MenuVO;
import com.xxl.ai.api.framework.model.entity.Config;
import com.xxl.ai.api.framework.service.ConfigService;
import com.xxl.ai.api.framework.service.RoleService;
import com.xxl.ai.api.framework.util.I18nUtil;
import com.xxl.sso.core.annotation.XxlSso;
import com.xxl.sso.core.helper.XxlSsoHelper;
import com.xxl.sso.core.model.LoginInfo;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * index controller
 *
 * @author xuxueli 2015-12-19 16:13:16
 */
@RestController
public class IndexController {

	@Resource
	private RoleService roleService;

	@Resource
	private ConfigService configService;

    // ---------------------- index ----------------------

	/**
	 * 首页
	 */
	@RequestMapping("/")
	@XxlSso(login = false)
	public Object index() {
		ClassPathResource indexPage = new ClassPathResource("static/index.html");

		// 前端资源不存在，返回提示信息避免 404
		if (!indexPage.exists()) {
			return "Frontend resources not found, please build frontend first.";

		}

		// 前端资源完成构建，返回首页
		return indexPage;
	}

	/**
	 * 欢迎页
	 */
	@RequestMapping("/welcome")
	@XxlSso(login = false)
	public String welcome() {
        return StringTool.format("Welcome to {0}  {1} ",
                I18nUtil.getString("admin_name_full"),
                I18nUtil.getString("admin_version")
        );
	}


	// ---------------------- loadBaseConfig ----------------------

	/**
	 * 加载系统基础配置
	 *
	 * 返回：界面语言（后端系统配置，本地缓存）、登录验证码开关
	 */
	@RequestMapping("/loadBaseConfig")
	@XxlSso(login = false)
	public Response<BaseConfigDTO> loadBaseConfig() {
		BaseConfigDTO baseConfigDTO = new BaseConfigDTO();
		baseConfigDTO.setLanguage(I18nUtil.getI18n());

		// 登录验证码开关：从系统配置中读取（配置Key：system.login.captcha.enabled，值为 true/false）
		Config captchaConfig = configService.loadByKeyWithCache("system.login.captcha.enabled").getData();
		baseConfigDTO.setCaptchaEnabled(captchaConfig != null && Boolean.parseBoolean(captchaConfig.getValue()));

		return Response.ofSuccess(baseConfigDTO);
	}


	// ---------------------- getMenus ----------------------

	/**
	 * 获取当前用户菜单树
	 *
	 * 仅返回纯业务菜单数据，路由与菜单结构由前端按自身 UI 库适配
	 */
	@RequestMapping("/getMenus")
	@XxlSso
	public Response<List<MenuVO>> getMenus(HttpServletRequest request) {

		// login check
		Response<LoginInfo> loginCheckResult = XxlSsoHelper.loginCheckWithAttr(request);

		// query user resource
		int userId = Integer.parseInt(loginCheckResult.getData().getUserId());
		List<com.xxl.ai.api.framework.model.entity.Resource> resourceList = roleService.queryResourceByUserid(userId, -1);

		// 从 flat list 构建纯业务菜单树（Resource 实体无 children 字段）
		return Response.ofSuccess(buildMenuTree(resourceList));
	}

	/**
	 * 从 flat Resource 列表构建纯业务菜单树
	 *
	 * 仅映射业务字段（含子菜单），不涉及任何前端路由结构；按钮（type=2）跳过。
	 */
	private List<MenuVO> buildMenuTree(List<com.xxl.ai.api.framework.model.entity.Resource> resourceList) {
		if (CollectionTool.isEmpty(resourceList)) {
			return new ArrayList<>();
		}
		// 按 parentId 分组
		Map<Integer, List<com.xxl.ai.api.framework.model.entity.Resource>> parentMap = new HashMap<>();
		for (com.xxl.ai.api.framework.model.entity.Resource resource : resourceList) {
			if (resource.getType() == ResourceTypeEnum.BUTTOM.getCode()) {
				continue;
			}
			parentMap.computeIfAbsent(resource.getParentId(), k -> new ArrayList<>()).add(resource);
		}
		// 从根节点开始构建
		return buildMenuChildren(parentMap.get(0), parentMap);
	}

	private List<MenuVO> buildMenuChildren(List<com.xxl.ai.api.framework.model.entity.Resource> resources, Map<Integer, List<com.xxl.ai.api.framework.model.entity.Resource>> parentMap) {
		if (CollectionTool.isEmpty(resources)) {
			return new ArrayList<>();
		}
		List<MenuVO> menuList = new ArrayList<>();
		for (com.xxl.ai.api.framework.model.entity.Resource resource : resources) {
			MenuVO menu = new MenuVO(resource);
			menu.setChildren(buildMenuChildren(parentMap.get(resource.getId()), parentMap));
			menuList.add(menu);
		}
		return menuList;
	}


	// ---------------------- default error page ----------------------

	@RequestMapping(value = "/errorpage")
	@XxlSso(login = false)
	public Response<String> errorPage(HttpServletResponse response) {
		String exceptionMsg = "Error, HTTP Status Code: "+response.getStatus();
		return Response.ofFail(exceptionMsg);
	}

}
