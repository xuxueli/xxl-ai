package com.xxl.ai.api.business.space.service.impl;

import com.xxl.ai.api.business.agent.mapper.AgentMapper;
import com.xxl.ai.api.business.knowledge.base.mapper.KnowledgeBaseMapper;
import com.xxl.ai.api.business.mcp.mapper.McpMapper;
import com.xxl.ai.api.business.skill.mapper.SkillMapper;
import com.xxl.ai.api.business.space.mapper.SpaceMapper;
import com.xxl.ai.api.business.space.mapper.UserSpaceMapper;
import com.xxl.ai.api.business.space.model.SpaceContext;
import com.xxl.ai.api.business.space.model.adaptor.SpaceAdaptor;
import com.xxl.ai.api.business.space.model.dto.SpaceDTO;
import com.xxl.ai.api.business.space.model.entity.Space;
import com.xxl.ai.api.business.space.model.entity.UserSpace;
import com.xxl.ai.api.business.space.service.SpaceService;
import com.xxl.ai.api.business.supplier.mapper.SupplierMapper;
import com.xxl.sso.core.helper.XxlSsoHelper;
import com.xxl.sso.core.model.LoginInfo;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 业务空间 Service 实现
 *
 * @author xxl-ai 2026-09-05
 */
@Service
public class SpaceServiceImpl implements SpaceService {

    @Resource
    private SpaceMapper spaceMapper;
    @Resource
    private UserSpaceMapper userSpaceMapper;
    @Resource
    private SupplierMapper supplierMapper;
    @Resource
    private McpMapper mcpMapper;
    @Resource
    private SkillMapper skillMapper;
    @Resource
    private KnowledgeBaseMapper knowledgeBaseMapper;
    @Resource
    private AgentMapper agentMapper;

    /**
     * 按ID查询单条空间
     */
    @Override
    public Space load(long id) {
        return spaceMapper.load(id);
    }

    /**
     * 按编码查询单条空间
     */
    @Override
    public Space loadByCode(String code) {
        return spaceMapper.loadByCode(code);
    }

    /**
     * 分页查询空间列表
     */
    @Override
    public PageModel<SpaceDTO> pageList(int offset, int pagesize, String name, int status) {
        List<Space> pageList = spaceMapper.pageList(offset, pagesize, name, status);
        int totalCount = spaceMapper.pageListCount(offset, pagesize, name, status);
        List<SpaceDTO> pageListDto = SpaceAdaptor.adapt2dto(pageList);
        PageModel<SpaceDTO> pageModel = new PageModel<>();
        pageModel.setData(pageListDto);
        pageModel.setTotal(totalCount);
        return pageModel;
    }

    /**
     * 新增空间（编码唯一校验）
     */
    @Override
    public Response<String> insert(SpaceDTO dto) {
        Space space = SpaceAdaptor.adapt(dto);
        if (space == null || StringTool.isBlank(space.getName())) {
            return Response.ofFail("空间名称不能为空");
        }
        if (StringTool.isBlank(space.getCode())) {
            return Response.ofFail("空间编码不能为空");
        }
        space.setCode(space.getCode().trim());
        if (!space.getCode().matches("^[a-z][a-z0-9]*$")) {
            return Response.ofFail("空间编码格式错误：小写字母开头，仅允许小写字母/数字");
        }
        Space existSpace = spaceMapper.loadByCode(space.getCode());
        if (existSpace != null) {
            return Response.ofFail("空间编码已存在");
        }
        spaceMapper.insert(space);
        return Response.ofSuccess();
    }

    /**
     * 更新空间（编码唯一校验，排除自身）
     */
    @Override
    public Response<String> update(SpaceDTO dto) {
        Space space = SpaceAdaptor.adapt(dto);
        if (space == null || StringTool.isBlank(space.getName())) {
            return Response.ofFail("空间名称不能为空");
        }
        if (StringTool.isBlank(space.getCode())) {
            return Response.ofFail("空间编码不能为空");
        }
        space.setCode(space.getCode().trim());
        if (!space.getCode().matches("^[a-z][a-z0-9]*$")) {
            return Response.ofFail("空间编码格式错误：小写字母开头，仅允许小写字母/数字");
        }
        Space existSpace = spaceMapper.loadByCode(space.getCode());
        if (existSpace != null && existSpace.getId() != space.getId()) {
            return Response.ofFail("空间编码已存在");
        }
        int ret = spaceMapper.update(space);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 批量删除空间（限制：至少保留一个空间；已授权给用户或存在业务资产的空间禁止删除）
     */
    @Override
    public Response<String> deleteByIds(List<Long> ids) {
        if (CollectionTool.isEmpty(ids)) {
            return Response.ofFail("请选择要删除的空间");
        }
        List<Space> existList = spaceMapper.listByIds(ids);
        if (CollectionTool.isEmpty(existList)) {
            return Response.ofFail("请选择要删除的空间");
        }
        // 限制1：至少保留一个业务空间（禁止删除最后一个/全部空间）
        if (spaceMapper.countAll() <= existList.size()) {
            return Response.ofFail("至少需保留一个业务空间，禁止删除");
        }
        for (Space space : existList) {
            long id = space.getId();
            // 限制2：已被授权给用户的空间禁止删除
            if (userSpaceMapper.countBySpaceId(id) > 0) {
                return Response.ofFail("空间[" + space.getName() + "]已授权给用户，禁止删除");
            }
            // 限制3：空间下存在业务资产（供应商/MCP/Skill/知识库/Agent）禁止删除
            if (supplierMapper.countBySpaceId(id) > 0
                    || mcpMapper.countBySpaceId(id) > 0
                    || skillMapper.countBySpaceId(id) > 0
                    || knowledgeBaseMapper.countBySpaceId(id) > 0
                    || agentMapper.countBySpaceId(id) > 0) {
                return Response.ofFail("空间[" + space.getName() + "]下存在业务资产，禁止删除");
            }
        }
        int ret = spaceMapper.deleteByIds(ids);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 空间访问校验：管理员直通，普通用户校验授权关系
     */
    @Override
    public Response<SpaceContext> checkSpace(HttpServletRequest request, Integer spaceId) {
        Response<LoginInfo> loginInfoResponse = XxlSsoHelper.loginCheckWithAttr(request);
        LoginInfo loginInfo = (loginInfoResponse != null && loginInfoResponse.getData() != null)
                ? loginInfoResponse.getData() : null;
        if (loginInfo == null) {
            return Response.ofFail("登录态异常，请重新登录");
        }
        if (spaceId == null || spaceId <= 0) {
            return Response.ofFail("请选择业务空间");
        }
        Space space = spaceMapper.load(spaceId);
        if (space == null) {
            return Response.ofFail("业务空间不存在");
        }
        if (space.getStatus() == 1) {
            return Response.ofFail("业务空间已停用");
        }
        int userId = Integer.parseInt(loginInfo.getUserId());
        boolean admin = loginInfo.getRoleList() != null && loginInfo.getRoleList().contains("admin");
        if (!admin && !checkAccess(userId, spaceId)) {
            return Response.ofFail("无该业务空间的访问权限");
        }
        SpaceContext context = new SpaceContext();
        context.setUserId(userId);
        context.setUserName(loginInfo.getUserName());
        context.setAdmin(admin);
        context.setSpaceId(spaceId);
        context.setSpaceName(space.getName());
        return Response.ofSuccess(context);
    }

    /**
     * 查询用户可见空间列表
     */
    @Override
    public List<Space> listByUser(int userId, boolean admin) {
        if (admin) {
            return spaceMapper.listAll();
        }
        return spaceMapper.listByUserId(userId);
    }

    /**
     * 查询用户被授权的空间ID集合
     */
    @Override
    public Response<List<Integer>> loadSpaceIdsByUserId(int userId) {
        List<Long> spaceIdList = userSpaceMapper.loadSpaceIdsByUserId(userId);
        List<Integer> spaceIds = spaceIdList.stream().map(Long::intValue).collect(Collectors.toList());
        return Response.ofSuccess(spaceIds);
    }

    /**
     * 保存用户的空间授权（全量覆盖）
     */
    @Override
    public Response<String> saveUserSpaces(int userId, List<Integer> spaceIds) {
        userSpaceMapper.deleteByUserId(userId);
        if (CollectionTool.isEmpty(spaceIds)) {
            return Response.ofSuccess();
        }
        List<UserSpace> list = new ArrayList<>();
        for (Integer spaceId : spaceIds) {
            if (spaceId == null || spaceId <= 0) {
                continue;
            }
            Space space = spaceMapper.load(spaceId);
            if (space == null) {
                continue;
            }
            UserSpace userSpace = new UserSpace();
            userSpace.setUserId(userId);
            userSpace.setSpaceId(spaceId);
            list.add(userSpace);
        }
        if (CollectionTool.isNotEmpty(list)) {
            userSpaceMapper.insertBatch(list);
        }
        return Response.ofSuccess();
    }

    /**
     * 空间访问权限校验（普通用户专属）
     */
    @Override
    public boolean checkAccess(int userId, long spaceId) {
        return userSpaceMapper.countByUserAndSpace(userId, spaceId) > 0;
    }

}