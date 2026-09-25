package com.xxl.ai.api.business.harness.skill;

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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Skill 工具工厂（spring-ai-agent-utils SkillsTool）
 *
 * 把「Agent 绑定的 Skill」（DB 文件树）物化为本地技能目录，构建 SkillsTool：
 *  - 目录结构：{skill.root}/agent_{agentId}/{skillName}/SKILL.md（agentId 全局唯一，每技能独立子目录，Agent 级沙箱隔离）
 *  - 变更检测：Skill 内容变更由写侧刷新 xxl_ai_skill.update_time，此处按「技能ID:更新时间」指纹比对，
 *    指纹不一致时整目录重建（清空再物化，杜绝换绑/删除后的残留文件）
 *  - 缓存：按 agentId 缓存快照（指纹 + 根目录 + SkillsTool），指纹不变直接复用
 *
 *
 * ${xxl-ai.skill.root}/
 * └── {spaceId}/
 *     └── agent_{agentId}/
 *         ├── .fingerprint          # 单行指纹，仅缓存校验用
 *         ├── {skillName}/          # 每个技能一个子目录（name 空间内唯一，且仅字母数字中划线）
 *         │   ├── SKILL.md
 *         │   ├── scripts/
 *         │   └── reference/
 *         └── {skillName2}/
 *             └── SKILL.md
 *
 * @author xxl-ai 2026-09-12
 */
@Component
public class SkillToolFactory {

    private static final Logger logger = LoggerFactory.getLogger(SkillToolFactory.class);

    private static final String SKILL_FILE_NAME = "SKILL.md";

    /** 指纹标记文件名（Agent 根下，仅本地缓存校验用） */
    private static final String MARKER_FILE_NAME = ".fingerprint";

    @Resource
    private SkillService skillService;
    @Resource
    private SkillFileMapper skillFileMapper;

    /** SKILL根目录 */
    @Value("${xxl-ai.skill.root}")
    private String skillRoot;

    /** Agent 物化快照缓存（agentId → 指纹 + 根目录 + 技能工具） */
    private final ConcurrentHashMap<Long, SkillSnapshot> snapshotCache = new ConcurrentHashMap<>();

    /** 按 Agent 串行物化锁（避免并发重建互相破坏目录） */
    private final ConcurrentHashMap<Long, Object> syncLocks = new ConcurrentHashMap<>();

    /**
     * Agent 物化快照：指纹与本地根一致时复用工具
     */
    private record SkillSnapshot(String fingerprint, Path root, ToolCallback tool) {
    }

    /**
     * 构建 Agent 装配的 Skill 工具（无技能或技能无有效 SKILL.md 时返回 null 表示不注册）
     */
    public Object buildTool(Agent agent) {
        SkillSnapshot snapshot = sync(agent);
        return snapshot == null ? null : snapshot.tool();
    }

    /**
     * 清理 Agent 物化沙箱：摘除快照缓存并删除本地目录（Agent 删除时调用）
     *
     * @param agentId Agent ID
     */
    public void evict(long agentId) {
        SkillSnapshot cached = snapshotCache.remove(agentId);
        if (cached == null) {
            return;
        }
        try {
            deleteRecursively(cached.root());
        } catch (Exception e) {
            logger.warn("Agent Skill 沙箱清理失败, agentId={}, err={}", agentId, e.getMessage());
        }
    }

    /**
     * 构建 Agent 装配的终端/文件执行工具集（无技能时返回空列表表示不注册）
     *
     * 与 buildTool 配套：SkillsTool 注入 SKILL.md 内容（含 bash 指令），此处提供 SKILL.md 依赖的
     * 执行能力（ShellTools 的 bash/bash_output/kill_shell 与 FileSystemTools 的 Read/Write/Edit、
     * GlobTool 的 Glob、GrepTool 的 Grep、ListDirectoryTool 的 List Directory），
     * 全部限定于 Agent 物化根，按 Agent 隔离沙箱
     */
    public List<Object> buildExecutorTools(Agent agent) {
        SkillSnapshot snapshot = sync(agent);
        if (snapshot == null) {
            return new ArrayList<>();
        }
        Path agentRoot = snapshot.root();
        List<Object> tools = new ArrayList<>();
        tools.add(ShellTools.builder().workingDirectory(agentRoot).build());
        tools.add(FileSystemTools.builder().allowedDirectory(agentRoot).build());
        tools.add(GlobTool.builder().workingDirectory(agentRoot).allowedDirectory(agentRoot).build());
        tools.add(GrepTool.builder().workingDirectory(agentRoot).allowedDirectory(agentRoot).build());
        tools.add(ListDirectoryTool.builder().workingDirectory(agentRoot).allowedDirectory(agentRoot).build());
        return tools;
    }

    /**
     * 同步并返回 Agent 物化快照：指纹变更则整目录重建，否则复用缓存
     */
    private SkillSnapshot sync(Agent agent) {
        List<Long> skillIdList = splitIds(agent.getSkillIds());
        if (CollectionTool.isEmpty(skillIdList)) {
            return null;
        }
        List<Skill> skillList = skillService.listByIds(skillIdList);
        if (CollectionTool.isEmpty(skillList)) {
            return null;
        }
        String fingerprint = buildFingerprint(skillList);
        SkillSnapshot cached = snapshotCache.get(agent.getId());
        if (isSnapshotValid(cached, fingerprint)) {
            return cached;
        }
        synchronized (syncLock(agent.getId())) {
            // 双重检查：并发请求下避免重复重建
            cached = snapshotCache.get(agent.getId());
            if (isSnapshotValid(cached, fingerprint)) {
                return cached;
            }
            Path root = agentRoot(agent);
            try {
                // 全量重建：先清空 Agent 目录，再物化全部启用技能
                deleteRecursively(root);
                Files.createDirectories(root);
                boolean hasSkill = false;
                for (Skill skill : skillList) {
                    if (skill.getStatus() == 1) {
                        continue;
                    }
                    if (materializeSkill(root.resolve(sanitize(skill.getName())), skill.getId())) {
                        hasSkill = true;
                    }
                }
                writeMarker(root, fingerprint);
                // 无有效 SKILL.md 时仅物化文件、不构建技能工具（SkillsTool 要求至少一个技能）
                ToolCallback tool = hasSkill
                        ? SkillsTool.builder().addSkillsDirectory(root.toString()).build()
                        : null;
                SkillSnapshot snapshot = new SkillSnapshot(fingerprint, root, tool);
                snapshotCache.put(agent.getId(), snapshot);
                logger.info("Skill 物化完成, agentId={}, path={}", agent.getId(), root);
                return snapshot;
            } catch (Exception e) {
                logger.warn("Agent Skill 物化失败, agentId={}, err={}", agent.getId(), e.getMessage());
                return cached;
            }
        }
    }

    /**
     * 本地快照是否有效：指纹一致且标记文件存在且内容一致
     */
    private boolean isSnapshotValid(SkillSnapshot cached, String fingerprint) {
        if (cached == null || !fingerprint.equals(cached.fingerprint())) {
            return false;
        }
        try {
            Path marker = cached.root().resolve(MARKER_FILE_NAME);
            return Files.exists(marker)
                    && fingerprint.equals(Files.readString(marker, StandardCharsets.UTF_8));
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * 写入指纹标记（覆盖写，一行文本）
     */
    private void writeMarker(Path root, String fingerprint) throws IOException {
        Files.writeString(root.resolve(MARKER_FILE_NAME), fingerprint, StandardCharsets.UTF_8);
    }

    /**
     * 物化单个 Skill 文件树到技能目录，返回是否包含 SKILL.md
     */
    private boolean materializeSkill(Path skillDir, long skillId) throws IOException {
        List<SkillFile> fileList = skillFileMapper.listBySkill(skillId);
        if (CollectionTool.isEmpty(fileList)) {
            logger.warn("Skill 无内容文件, skillId={}", skillId);
            return false;
        }
        Map<Long, SkillFile> fileMap = new HashMap<>();
        for (SkillFile file : fileList) {
            fileMap.put(file.getId(), file);
        }
        // 组件节点路径：根级节点名即路径，子节点逐级拼接父目录
        Map<Long, String> pathCache = new HashMap<>();
        boolean hasMain = false;
        for (SkillFile file : fileList) {
            Path target = skillDir.resolve(resolvePath(file, fileMap, pathCache));
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
        return hasMain;
    }

    /**
     * 递归删除目录（不存在的路径忽略）
     */
    private void deleteRecursively(Path path) throws IOException {
        if (!Files.exists(path)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(path)) {
            List<Path> pathList = paths.sorted(Comparator.reverseOrder()).collect(Collectors.toList());
            for (Path item : pathList) {
                Files.deleteIfExists(item);
            }
        }
    }

    /**
     * 技能变更指纹：技能ID + 更新时间（内容变更由写侧刷新 skill.update_time）
     */
    private String buildFingerprint(List<Skill> skillList) {
        return skillList.stream()
                .sorted(Comparator.comparingLong(Skill::getId))
                .map(skill -> skill.getId() + ":" + (skill.getUpdateTime() == null ? 0L : skill.getUpdateTime().getTime()))
                .collect(Collectors.joining(";"));
    }

    /**
     * Agent 物化根目录：{skill.root}/agent_{agentId}（agentId 全局唯一，无需再按空间分层）
     */
    private Path agentRoot(Agent agent) {
        return skillsRoot().resolve("agent_" + agent.getId());
    }

    /**
     * SKILL物化根目录 Path（读配置，支持运行期改配置后按需生效）
     */
    private Path skillsRoot() {
        return Path.of(skillRoot);
    }

    /**
     * 按 Agent 获取物化锁
     */
    private Object syncLock(long agentId) {
        return syncLocks.computeIfAbsent(agentId, key -> new Object());
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
