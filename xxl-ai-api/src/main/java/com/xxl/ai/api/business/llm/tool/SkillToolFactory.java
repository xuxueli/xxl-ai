package com.xxl.ai.api.business.llm.tool;

import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.skill.mapper.SkillFileMapper;
import com.xxl.ai.api.business.skill.model.entity.Skill;
import com.xxl.ai.api.business.skill.model.entity.SkillFile;
import com.xxl.ai.api.business.skill.service.SkillService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springaicommunity.agent.tools.FileSystemTools;
import org.springaicommunity.agent.tools.GlobTool;
import org.springaicommunity.agent.tools.GrepTool;
import org.springaicommunity.agent.tools.ListDirectoryTool;
import org.springaicommunity.agent.tools.ShellTools;
import org.springaicommunity.agent.tools.SkillsTool;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Skill 工具工厂（spring-ai-agent-utils SkillsTool）
 *
 * 把「Agent 绑定的 Skill」（DB 文件树）物化为 SKILL.md 知识模块目录，构建 SkillsTool：
 *  - SkillsTool 以单个 Skill 工具注册进 ChatClient，模型按语义匹配触发，注入完整技能内容
 *  - 按（Agent + 技能指纹）缓存复用，技能内容变更自动重建
 * 同时提供配套的终端/文件执行工具（buildExecutorTools）：技能内容中的 bash 指令依赖
 * 终端与文件操作能力（Shell + Read/Write/Edit/Glob/Grep/List），工作目录取空间技能物化根，
 * 按空间隔离沙箱
 *
 * @author xxl-ai 2026-09-12
 */
@Component
public class SkillToolFactory {

    private static final Logger logger = LoggerFactory.getLogger(SkillToolFactory.class);

    private static final String SKILL_FILE_NAME = "SKILL.md";

    @Resource
    private SkillService skillService;
    @Resource
    private SkillFileMapper skillFileMapper;

    /** SKILL.md 物化根目录 */
    private final Path skillsRoot = Path.of(System.getProperty("java.io.tmpdir"), "xxl-ai", "skills");

    /** 技能工具缓存（agentId + 技能指纹 → SkillsTool） */
    private final ConcurrentHashMap<String, ToolCallback> skillsToolCache = new ConcurrentHashMap<>();

    /**
     * 构建 Agent 装配的 Skill 工具（无技能时返回 null 表示不注册）
     */
    public ToolCallback buildTool(Agent agent) {
        List<Long> skillIdList = splitIds(agent.getSkillIds());
        if (CollectionTool.isEmpty(skillIdList)) {
            return null;
        }
        List<Skill> skillList = skillService.listByIds(skillIdList);
        if (CollectionTool.isEmpty(skillList)) {
            return null;
        }
        // 技能指纹：技能ID + 更新时间 + 技能文件树更新时间，内容变更自动重建
        String fingerprint = buildFingerprint(skillList);
        String cacheKey = agent.getId() + ":" + fingerprint;
        ToolCallback cached = skillsToolCache.get(cacheKey);
        if (cached != null) {
            return cached;
        }
        try {
            Path spaceRoot = skillsRoot.resolve(String.valueOf(agent.getSpaceId()));
            for (Skill skill : skillList) {
                if (skill.getStatus() == 1) {
                    continue;
                }
                materializeSkill(spaceRoot, skill.getId());
            }
            ToolCallback skillsTool = SkillsTool.builder().addSkillsDirectory(spaceRoot.toString()).build();
            skillsToolCache.put(cacheKey, skillsTool);
            return skillsTool;
        } catch (Exception e) {
            logger.warn("Agent Skill 工具构建失败, agentId={}, err={}", agent.getId(), e.getMessage());
            return null;
        }
    }

    /**
     * 构建 Agent 装配的终端/文件执行工具集（无技能时返回空列表表示不注册）
     *
     * 与 buildTool 配套：SkillsTool 注入 SKILL.md 内容（含 bash 指令），此处提供 SKILL.md 依赖的
     * 执行能力（ShellTools 的 bash/bash_output/kill_shell 与 FileSystemTools 的 Read/Write/Edit、
     * GlobTool 的 Glob、GrepTool 的 Grep、ListDirectoryTool 的 List Directory），
     * 全部限定于空间技能物化根，按空间隔离沙箱
     */
    public List<Object> buildExecutorTools(Agent agent) {
        List<Long> skillIdList = splitIds(agent.getSkillIds());
        if (CollectionTool.isEmpty(skillIdList)) {
            return new ArrayList<>();
        }
        Path spaceRoot = skillsRoot.resolve(String.valueOf(agent.getSpaceId()));
        try {
            Files.createDirectories(spaceRoot);
            logger.info("执行工具工作目录创建成功, agentId={}, path={}", agent.getId(), spaceRoot.toString());
        } catch (IOException e) {
            logger.warn("执行工具工作目录创建失败, agentId={}, err={}", agent.getId(), e.getMessage());
            return new ArrayList<>();
        }
        List<Object> tools = new ArrayList<>();
        tools.add(ShellTools.builder().workingDirectory(spaceRoot).build());
        tools.add(FileSystemTools.builder().allowedDirectory(spaceRoot).build());
        tools.add(GlobTool.builder().workingDirectory(spaceRoot).allowedDirectory(spaceRoot).build());
        tools.add(GrepTool.builder().workingDirectory(spaceRoot).allowedDirectory(spaceRoot).build());
        tools.add(ListDirectoryTool.builder().workingDirectory(spaceRoot).allowedDirectory(spaceRoot).build());
        return tools;
    }

    /**
     * 物化单个 Skill 文件树到目录
     */
    private void materializeSkill(Path spaceRoot, long skillId) throws IOException {
        List<SkillFile> fileList = skillFileMapper.listBySkill(skillId);
        if (CollectionTool.isEmpty(fileList)) {
            logger.warn("Skill 无内容文件, skillId={}", skillId);
            return;
        }
        Map<Long, SkillFile> fileMap = new HashMap<>();
        for (SkillFile file : fileList) {
            fileMap.put(file.getId(), file);
        }
        // 组件节点路径：根级节点名即路径，子节点逐级拼接父目录
        Map<Long, String> pathCache = new HashMap<>();
        boolean hasMain = false;
        for (SkillFile file : fileList) {
            Path target = spaceRoot.resolve(resolvePath(file, fileMap, pathCache));
            if (file.getType() == 1) {
                if (SKILL_FILE_NAME.equals(file.getName())) {
                    hasMain = true;
                }
                if (target.getParent() != null) {
                    Files.createDirectories(target.getParent());
                }
                Files.writeString(target, file.getContent() == null ? "" : file.getContent(),
                        StandardCharsets.UTF_8);
            } else if (file.getType() == 0) {
                Files.createDirectories(target);
            }
        }
        if (!hasMain) {
            logger.warn("Skill 缺少 SKILL.md, skillId={}", skillId);
        }
    }

    /**
     * 技能文件树指纹：技能ID + 更新时间 + 文件树最新更新时间
     */
    private String buildFingerprint(List<Skill> skillList) {
        StringBuilder sb = new StringBuilder();
        for (Skill skill : skillList) {
            sb.append(skill.getId()).append(':').append(skill.getVersion()).append('\n');
            long latest = skill.getUpdateTime() == null ? 0 : skill.getUpdateTime().getTime();
            List<SkillFile> fileList = skillFileMapper.listBySkill(skill.getId());
            if (CollectionTool.isNotEmpty(fileList)) {
                for (SkillFile file : fileList) {
                    long updateTime = file.getUpdateTime() == null ? 0 : file.getUpdateTime().getTime();
                    if (updateTime > latest) {
                        latest = updateTime;
                    }
                }
            }
            sb.append(skill.getId()).append(':').append(latest).append('\n');
        }
        return sb.toString();
    }

    /**
     * 解析节点路径：按 parentId 链自底向上拼接（净化路径分隔符，防目录穿越）
     */
    private String resolvePath(SkillFile file, Map<Long, SkillFile> fileMap, Map<Long, String> pathCache) {
        String cached = pathCache.get(file.getId());
        if (cached != null) {
            return cached;
        }
        String segment = sanitize(file.getName());
        String path;
        if (file.getParentId() == 0) {
            path = segment;
        } else {
            SkillFile parent = fileMap.get(file.getParentId());
            String parentPath = parent == null ? "" : resolvePath(parent, fileMap, pathCache);
            path = (parentPath.isEmpty() ? "" : parentPath + File.separator) + segment;
        }
        pathCache.put(file.getId(), path);
        return path;
    }

    /**
     * 路径净化：屏蔽路径分隔符与穿越片段
     */
    private String sanitize(String name) {
        if (StringTool.isBlank(name)) {
            return "_";
        }
        String cleaned = name.replace('\\', '_').replace('/', '_').replace("..", "_");
        return cleaned.isEmpty() ? "_" : cleaned;
    }

    /**
     * 逗号分隔字符串转 ID 集合
     */
    private List<Long> splitIds(String ids) {
        List<Long> list = new ArrayList<>();
        if (StringTool.isBlank(ids)) {
            return list;
        }
        for (String id : ids.split(",")) {
            if (StringTool.isNotBlank(id)) {
                try {
                    list.add(Long.parseLong(id.trim()));
                } catch (NumberFormatException ignored) {
                }
            }
        }
        return list;
    }

}