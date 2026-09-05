package com.xxl.ai.api.business.skill.service.impl;

import com.xxl.ai.api.business.common.client.CommunityClient;
import com.xxl.ai.api.business.skill.mapper.SkillMapper;
import com.xxl.ai.api.business.skill.model.adaptor.SkillAdaptor;
import com.xxl.ai.api.business.skill.model.dto.SkillDTO;
import com.xxl.ai.api.business.skill.model.entity.Skill;
import com.xxl.ai.api.business.skill.service.SkillService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Skill Service 实现
 *
 * @author xxl-ai 2026-09-05
 */
@Service
public class SkillServiceImpl implements SkillService {

    /** 社区地址配置Key */
    private static final String COMMUNITY_URL_KEY = "system.skill.community.url";

    @Resource
    private SkillMapper skillMapper;
    @Resource
    private CommunityClient communityClient;

    /**
     * 分页查询 Skill 列表
     */
    @Override
    public PageModel<SkillDTO> pageList(long spaceId, int offset, int pagesize, String name, int status) {
        List<Skill> pageList = skillMapper.pageList(spaceId, offset, pagesize, name, status);
        int totalCount = skillMapper.pageListCount(spaceId, offset, pagesize, name, status);
        List<SkillDTO> pageListDto = SkillAdaptor.adapt2dto(pageList);
        PageModel<SkillDTO> pageModel = new PageModel<>();
        pageModel.setData(pageListDto);
        pageModel.setTotal(totalCount);
        return pageModel;
    }

    /**
     * 新增 Skill
     */
    @Override
    public Response<String> insert(long spaceId, SkillDTO dto) {
        Skill skill = SkillAdaptor.adapt(dto);
        if (skill == null || StringTool.isBlank(skill.getName())) {
            return Response.ofFail("Skill名称不能为空");
        }
        if (StringTool.isBlank(skill.getVersion())) {
            skill.setVersion("1.0");
        }
        if (StringTool.isBlank(skill.getSource())) {
            skill.setSource("local");
        }
        skill.setSpaceId(spaceId);
        skillMapper.insert(skill);
        return Response.ofSuccess();
    }

    /**
     * 批量删除 Skill
     */
    @Override
    public Response<String> deleteByIds(List<Long> ids) {
        if (CollectionTool.isEmpty(ids)) {
            return Response.ofFail("请选择要删除的 Skill");
        }
        int ret = skillMapper.deleteByIds(ids);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 更新 Skill
     */
    @Override
    public Response<String> update(SkillDTO dto) {
        Skill skill = SkillAdaptor.adapt(dto);
        if (skill == null || StringTool.isBlank(skill.getName())) {
            return Response.ofFail("Skill名称不能为空");
        }
        int ret = skillMapper.update(skill);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 社区检索
     */
    @Override
    public Response<List<Map<String, Object>>> communitySearch(String keyword) {
        return communityClient.search(COMMUNITY_URL_KEY, keyword);
    }

    /**
     * 从社区保存：将社区选中项落库（source=community）
     */
    @Override
    public Response<String> saveFromCommunity(long spaceId, SkillDTO dto) {
        if (dto == null || StringTool.isBlank(dto.getName())) {
            return Response.ofFail("请选择有效的社区项（名称不能为空）");
        }
        if (StringTool.isBlank(dto.getContent())) {
            return Response.ofFail("社区项缺少 Skill 内容，无法保存");
        }
        dto.setSource("community");
        dto.setSpaceId(spaceId);
        if (StringTool.isBlank(dto.getVersion())) {
            dto.setVersion("1.0");
        }
        return insert(spaceId, dto);
    }

    /**
     * 查询空间内 Skill 列表
     */
    @Override
    public List<Skill> listBySpace(long spaceId) {
        return skillMapper.listBySpace(spaceId);
    }

    /**
     * 按ID集合查询 Skill 列表
     */
    @Override
    public List<Skill> listByIds(List<Long> ids) {
        return skillMapper.listByIds(ids);
    }

}