package com.xxl.ai.api.business.skill.service;

import com.xxl.ai.api.business.skill.model.dto.SkillFileDTO;
import com.xxl.tool.response.Response;

import java.util.List;

/**
 * SKILL 内容文件 Service（文件树管理）
 *
 * @author xxl-ai 2026-09-06
 */
public interface SkillFileService {

    /**
     * 查询某 SKILL 的完整文件树（不含文件内容，load 单独拉取）
     */
    Response<List<SkillFileDTO>> tree(long spaceId, long skillId);

    /**
     * 加载单个文件（含内容）
     */
    Response<SkillFileDTO> load(long spaceId, long id);

    /**
     * 新增目录
     */
    Response<String> insertDir(long spaceId, SkillFileDTO dto);

    /**
     * 新增文件（按扩展名推断 fileType）
     */
    Response<String> insertFile(long spaceId, SkillFileDTO dto);

    /**
     * 重命名（固定节点禁止）
     */
    Response<String> rename(long spaceId, SkillFileDTO dto);

    /**
     * 移动（固定节点禁止，禁止移入自身或其后代）
     */
    Response<String> move(long spaceId, SkillFileDTO dto);

    /**
     * 保存文件内容
     */
    Response<String> saveContent(long spaceId, SkillFileDTO dto);

    /**
     * 删除节点（固定节点禁止，目录递归删除后代）
     */
    Response<String> delete(long spaceId, long id);

}