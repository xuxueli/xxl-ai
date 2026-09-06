package com.xxl.ai.api.business.skill.service.impl;

import com.xxl.ai.api.business.skill.mapper.SkillFileMapper;
import com.xxl.ai.api.business.skill.mapper.SkillMapper;
import com.xxl.ai.api.business.skill.model.adaptor.SkillFileAdaptor;
import com.xxl.ai.api.business.skill.model.dto.SkillFileDTO;
import com.xxl.ai.api.business.skill.model.entity.Skill;
import com.xxl.ai.api.business.skill.model.entity.SkillFile;
import com.xxl.ai.api.business.skill.service.SkillFileService;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * SKILL 内容文件 Service 实现
 *
 * @author xxl-ai 2026-09-06
 */
@Service
public class SkillFileServiceImpl implements SkillFileService {

    @Resource
    private SkillFileMapper skillFileMapper;
    @Resource
    private SkillMapper skillMapper;

    /**
     * 查询文件树（内容不随树返回，树节点统一置空，编辑时 load 拉取）
     */
    @Override
    public Response<List<SkillFileDTO>> tree(long spaceId, long skillId) {
        Skill skill = skillMapper.load(skillId);
        if (skill == null || skill.getSpaceId() != spaceId) {
            return Response.ofFail("SKILL不存在或无权访问");
        }
        List<SkillFileDTO> tree = SkillFileAdaptor.buildTree(skillFileMapper.listBySkill(skillId));
        clearContent(tree);
        return Response.ofSuccess(tree);
    }

    /**
     * 加载单个文件
     */
    @Override
    public Response<SkillFileDTO> load(long spaceId, long id) {
        SkillFile file = skillFileMapper.load(id);
        if (file == null) {
            return Response.ofFail("节点不存在");
        }
        if (!isSkillInSpace(spaceId, file.getSkillId())) {
            return Response.ofFail("SKILL不存在或无权访问");
        }
        return Response.ofSuccess(SkillFileAdaptor.adapt2dto(file));
    }

    /**
     * 新增目录
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Response<String> insertDir(long spaceId, SkillFileDTO dto) {
        Response<String> check = checkInsert(spaceId, dto);
        if (!check.isSuccess()) {
            return check;
        }
        SkillFile dir = new SkillFile();
        dir.setSkillId(dto.getSkillId());
        dir.setParentId(dto.getParentId());
        dir.setName(dto.getName());
        dir.setType(0);
        dir.setLocked(0);
        dir.setSort(nextSort(dto.getSkillId(), dto.getParentId()));
        skillFileMapper.insert(dir);
        return Response.ofSuccess();
    }

    /**
     * 新增文件（按扩展名推断 fileType）
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Response<String> insertFile(long spaceId, SkillFileDTO dto) {
        Response<String> check = checkInsert(spaceId, dto);
        if (!check.isSuccess()) {
            return check;
        }
        SkillFile file = new SkillFile();
        file.setSkillId(dto.getSkillId());
        file.setParentId(dto.getParentId());
        file.setName(dto.getName());
        file.setType(1);
        file.setFileType(parseFileType(dto.getName()));
        file.setLocked(0);
        file.setSort(nextSort(dto.getSkillId(), dto.getParentId()));
        file.setContent(defaultContent(file.getFileType()));
        skillFileMapper.insert(file);
        return Response.ofSuccess();
    }

    /**
     * 重命名节点：固定节点禁止
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Response<String> rename(long spaceId, SkillFileDTO dto) {
        Response<SkillFile> nodeResp = loadNode(spaceId, dto.getId());
        if (!nodeResp.isSuccess()) {
            return Response.ofFail(nodeResp.getMsg());
        }
        SkillFile node = nodeResp.getData();
        if (node.getLocked() == 1) {
            return Response.ofFail("固定文件/目录禁止重命名");
        }
        String name = validateName(dto.getName());
        if (name == null) {
            return Response.ofFail("名称格式不合法（不能含路径分隔符等）");
        }
        if (skillFileMapper.countByName(node.getSkillId(), node.getParentId(), name, node.getId()) > 0) {
            return Response.ofFail("同级下已存在同名节点[" + name + "]");
        }
        SkillFile update = new SkillFile();
        update.setId(node.getId());
        update.setName(name);
        update.setFileType(node.getType() == 1 ? parseFileType(name) : null);
        update.setContent(node.getContent());
        update.setSort(node.getSort());
        skillFileMapper.update(update);
        return Response.ofSuccess();
    }

    /**
     * 移动节点：固定节点禁止、禁止移入自身或其后代
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Response<String> move(long spaceId, SkillFileDTO dto) {
        Response<SkillFile> nodeResp = loadNode(spaceId, dto.getId());
        if (!nodeResp.isSuccess()) {
            return Response.ofFail(nodeResp.getMsg());
        }
        SkillFile node = nodeResp.getData();
        if (node.getLocked() == 1) {
            return Response.ofFail("固定文件/目录禁止移动");
        }
        long targetParentId = dto.getParentId();
        if (targetParentId == node.getId()) {
            return Response.ofFail("不能移入自身");
        }
        if (targetParentId != 0) {
            // 目标父节点必须是与自身同 SKILL 的目录
            SkillFile parent = skillFileMapper.load(targetParentId);
            if (parent == null) {
                return Response.ofFail("目标目录不存在");
            }
            if (parent.getSkillId() != node.getSkillId() || parent.getType() != 0) {
                return Response.ofFail("目标必须是同 SKILL 下的目录");
            }
            // 禁止移入自己的后代（成环保护）
            if (isDescendant(node.getSkillId(), node.getId(), targetParentId)) {
                return Response.ofFail("不能移入自身的子目录");
            }
        }
        if (skillFileMapper.countByName(node.getSkillId(), targetParentId, node.getName(), node.getId()) > 0) {
            return Response.ofFail("目标目录下已存在同名节点[" + node.getName() + "]");
        }
        skillFileMapper.updateParent(node.getId(), targetParentId);
        return Response.ofSuccess();
    }

    /**
     * 保存文件内容
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Response<String> saveContent(long spaceId, SkillFileDTO dto) {
        Response<SkillFile> nodeResp = loadNode(spaceId, dto.getId());
        if (!nodeResp.isSuccess()) {
            return Response.ofFail(nodeResp.getMsg());
        }
        SkillFile node = nodeResp.getData();
        if (node.getType() != 1) {
            return Response.ofFail("目录不支持保存内容");
        }
        String content = dto.getContent() == null ? "" : dto.getContent();
        SkillFile update = new SkillFile();
        update.setId(node.getId());
        update.setName(node.getName());
        update.setFileType(node.getFileType());
        update.setContent(content);
        update.setSort(node.getSort());
        skillFileMapper.update(update);
        return Response.ofSuccess();
    }

    /**
     * 删除节点：固定节点禁止，目录递归删除后代
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Response<String> delete(long spaceId, long id) {
        Response<SkillFile> nodeResp = loadNode(spaceId, id);
        if (!nodeResp.isSuccess()) {
            return Response.ofFail(nodeResp.getMsg());
        }
        SkillFile node = nodeResp.getData();
        if (node.getLocked() == 1) {
            return Response.ofFail("固定文件/目录禁止删除");
        }
        // 收集自身 + 全部后代节点一并删除
        List<Long> ids = new ArrayList<>();
        ids.add(node.getId());
        collectDescendants(node.getSkillId(), node.getId(), ids);
        skillFileMapper.deleteByIds(ids);
        return Response.ofSuccess();
    }

    // ==================== 内部方法 ====================

    /**
     * 校验 SKILL 归属空间，返回 DTO（供新增目录/文件使用）
     */
    private Response<String> checkInsert(long spaceId, SkillFileDTO dto) {
        if (dto == null || dto.getSkillId() <= 0) {
            return Response.ofFail("参数不完整：缺少 SKILL");
        }
        if (!isSkillInSpace(spaceId, dto.getSkillId())) {
            return Response.ofFail("SKILL不存在或无权访问");
        }
        String name = validateName(dto.getName());
        if (name == null) {
            return Response.ofFail("名称格式不合法（不能含路径分隔符等）");
        }
        dto.setName(name);
        // 校验父目录：非根级必须是同 SKILL 目录
        if (dto.getParentId() != 0) {
            SkillFile parent = skillFileMapper.load(dto.getParentId());
            if (parent == null) {
                return Response.ofFail("父目录不存在");
            }
            if (parent.getSkillId() != dto.getSkillId() || parent.getType() != 0) {
                return Response.ofFail("父节点必须是同 SKILL 下的目录");
            }
        }
        if (skillFileMapper.countByName(dto.getSkillId(), dto.getParentId(), name, 0) > 0) {
            return Response.ofFail("同级下已存在同名节点[" + name + "]");
        }
        return Response.ofSuccess();
    }

    /**
     * 加载节点并校验 SKILL 归属空间
     */
    private Response<SkillFile> loadNode(long spaceId, long id) {
        if (id <= 0) {
            return Response.ofFail("节点ID不能为空");
        }
        SkillFile node = skillFileMapper.load(id);
        if (node == null) {
            return Response.ofFail("节点不存在");
        }
        if (!isSkillInSpace(spaceId, node.getSkillId())) {
            return Response.ofFail("SKILL不存在或无权访问");
        }
        return Response.ofSuccess(node);
    }

    /**
     * 某 SKILL 是否属于当前空间
     */
    private boolean isSkillInSpace(long spaceId, long skillId) {
        Skill skill = skillMapper.load(skillId);
        return skill != null && skill.getSpaceId() == spaceId;
    }

    /**
     * 名称格式校验：去除首尾空白，长度≤200，不包含路径分隔符/控制字符/纯点
     */
    private String validateName(String name) {
        if (StringTool.isBlank(name)) {
            return null;
        }
        String trimmed = name.trim();
        if (trimmed.length() > 200 || ".".equals(trimmed) || "..".equals(trimmed)) {
            return null;
        }
        for (char c : trimmed.toCharArray()) {
            if (c == '/' || c == '\\' || c == '\u0000' || Character.isISOControl(c)) {
                return null;
            }
        }
        return trimmed;
    }

    /**
     * 从文件名推断扩展名（小写，无扩展名默认 txt）
     */
    private String parseFileType(String name) {
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) {
            return "txt";
        }
        return name.substring(dot + 1).toLowerCase();
    }

    /**
     * 新文件默认内容模板
     */
    private String defaultContent(String fileType) {
        if ("md".equals(fileType)) {
            return "# 新文档\n\n请在此编写内容（Markdown）。\n";
        }
        return "";
    }

    /**
     * 同级下排序号：当前最大 sort + 1
     */
    private int nextSort(long skillId, long parentId) {
        List<SkillFile> siblings = skillFileMapper.listByParent(skillId, parentId);
        int max = 0;
        for (SkillFile s : siblings) {
            if (s.getSort() > max) {
                max = s.getSort();
            }
        }
        return max + 1;
    }

    /**
     * 收集指定节点的全部后代节点 ID（含各级目录内的文件）
     */
    private void collectDescendants(long skillId, long nodeId, List<Long> result) {
        List<SkillFile> all = skillFileMapper.listBySkill(skillId);
        Map<Long, List<SkillFile>> childrenMap = new HashMap<>();
        for (SkillFile f : all) {
            childrenMap.computeIfAbsent(f.getParentId(), k -> new ArrayList<>()).add(f);
        }
        // BFS 收集后代
        List<Long> queue = new ArrayList<>();
        queue.add(nodeId);
        while (!queue.isEmpty()) {
            long parentId = queue.remove(0);
            List<SkillFile> children = childrenMap.get(parentId);
            if (children == null) {
                continue;
            }
            for (SkillFile child : children) {
                result.add(child.getId());
                queue.add(child.getId());
            }
        }
    }

    /**
     * 判断 candidateId 是否为 nodeId 的后代（移动成环保护）
     */
    private boolean isDescendant(long skillId, long nodeId, long candidateId) {
        List<SkillFile> all = skillFileMapper.listBySkill(skillId);
        Map<Long, Long> parentMap = new HashMap<>();
        for (SkillFile f : all) {
            parentMap.put(f.getId(), f.getParentId());
        }
        long cur = candidateId;
        while (cur != 0) {
            Long parent = parentMap.get(cur);
            if (parent == null) {
                return false;
            }
            if (parent == nodeId) {
                return true;
            }
            cur = parent;
        }
        return false;
    }

    /**
     * 树节点递归清空 content（树接口不返回文件内容）
     */
    private void clearContent(List<SkillFileDTO> nodes) {
        if (nodes == null) {
            return;
        }
        for (SkillFileDTO node : nodes) {
            node.setContent(null);
            clearContent(node.getChildren());
        }
    }

}