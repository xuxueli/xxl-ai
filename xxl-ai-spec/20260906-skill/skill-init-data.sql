SET NAMES utf8mb4;

-- ============================================================
-- SKILL 测试数据（3 个流行 SKILL，可生产）：
--   1) code-review  代码审查（Anthropic Checkers 同款骨架）
--   2) docx         文档生成（Anthropic 官方 docx skill 结构）
--   3) debugging    系统化 Debug（Superpowers 调试方法论）
-- 文件树按应用播种逻辑补齐：SKILL.md + scripts/ + reference/（locked=1）
-- ============================================================

DELETE FROM xxl_ai_skill_file;
DELETE FROM xxl_ai_skill;
ALTER TABLE xxl_ai_skill AUTO_INCREMENT = 1;
ALTER TABLE xxl_ai_skill_file AUTO_INCREMENT = 1;

-- 1、SKILL 元信息（默认空间 space_id=1）
INSERT INTO xxl_ai_skill (id, space_id, name, description, version, status, add_time, update_time)
VALUES
    (1, 1, 'code-review', '代码审查 Skill：按安全/性能/可维护性清单对代码变更做结构化审查，输出分级评审意见（P0 阻断/P1 需改/P2 建议）', '1.0', 0, NOW(), NOW()),
    (2, 1, 'docx', '文档生成 Skill：基于 python-docx 将结构化内容输出为排版规范的 .docx 文档，供业务交付使用', '1.0', 0, NOW(), NOW()),
    (3, 1, 'debugging', '系统化 Debug Skill：基于假设-验证循环、二分定位与日志降噪，结构化排查问题根因', '1.0', 0, NOW(), NOW());

-- 2、SKILL 文件树（固定骨架，locked=1）
-- Skill1 code-review 根级
INSERT INTO xxl_ai_skill_file (id, skill_id, parent_id, name, `type`, file_type, content, locked, sort, add_time, update_time)
VALUES
    (1, 1, 0, 'SKILL.md', 1, 'md', CONCAT('---\n', 'name: code-review\n', 'description: 代码审查，按安全/性能/可维护性清单审查代码变更并输出分级意见\n', '---\n', '\n', '# code-review\n', '\n', '对代码变更（PR/DIFF）执行结构化审查，输出按严重级别分级的评审意见。\n', '\n', '## 使用方式\n', '1. 获取变更范围与关联文件。\n', '2. 查阅 reference/security-checklist.md 与 reference/review-template.md。\n', '3. 逐文件按清单检查，记录问题级别（P0 阻断 / P1 需修改 / P2 建议）。\n', '4. 汇总输出评审报告，可借助 scripts/review-report.py 生成 Markdown 报告。\n', '\n', '## 目录说明\n', '- SKILL.md：入口与流程说明\n', '- scripts/：评审报告生成脚本\n', '- reference/：检查清单与报告模板'), 1, 1, NOW(), NOW()),
    (2, 1, 0, 'scripts', 0, NULL, NULL, 1, 2, NOW(), NOW()),
    (3, 1, 0, 'reference', 0, NULL, NULL, 1, 3, NOW(), NOW());

-- Skill1 code-review 子级
INSERT INTO xxl_ai_skill_file (id, skill_id, parent_id, name, `type`, file_type, content, locked, sort, add_time, update_time)
VALUES
    (4, 1, 2, 'review-report.py', 1, 'py', CONCAT('#!/usr/bin/env python3\n', '"""基于 JSON 输入的问题列表生成分级审查报告（Markdown）。"""\n', 'import json\n', 'import sys\n', '\n', 'def main():\n', '    items = json.load(sys.stdin)\n', '    for item in items:\n', '        level = item.get("level", "P2")\n', '        print("- [{}] {}: {}".format(level, item.get("file", ""), item.get("msg", "")))\n', '\n', 'if __name__ == "__main__":\n', '    main()'), 0, 1, NOW(), NOW()),
    (5, 1, 3, 'security-checklist.md', 1, 'md', CONCAT('# 安全检查清单\n', '\n', '- 注入：SQL/命令/模板注入是否被正确转义或参数化\n', '- 敏感信息：日志、错误信息中是否泄露密钥、Token、个人数据\n', '- 输入校验：越权、越界、特殊字符是否被拦截\n', '- 认证授权：接口是否有鉴权，越权访问是否可被阻断\n', '- 依赖安全：引入的依赖版本是否有已知漏洞'), 0, 1, NOW(), NOW()),
    (6, 1, 3, 'review-template.md', 1, 'md', CONCAT('# 代码审查报告\n', '\n', '## 变更范围\n', '## 评审结论（通过 / 有条件通过 / 拒绝）\n', '## 问题列表\n', '| 级别 | 文件 | 行号 | 问题描述 | 建议 |\n', '## 其他建议'), 0, 2, NOW(), NOW());

-- Skill2 docx 根级
INSERT INTO xxl_ai_skill_file (id, skill_id, parent_id, name, `type`, file_type, content, locked, sort, add_time, update_time)
VALUES
    (7, 2, 0, 'SKILL.md', 1, 'md', CONCAT('---\n', 'name: docx\n', 'description: 文档生成，基于 python-docx 一键生成排版规范的 .docx 文档\n', '---\n', '\n', '# docx\n', '\n', '生成 Word 文档：内容结构化输入，输出排版规范（标题/表格/样式）的 .docx 文件。\n', '\n', '## 使用方式\n', '1. 在 scripts/ 目录安装依赖：pip install -r requirements.txt。\n', '2. 参照 scripts/docx.py 提供的辅助函数组织文档内容（标题/段落/表格/分页）。\n', '3. 生成结果以 .docx 落盘，供业务交付使用。\n', '\n', '## 目录说明\n', '- SKILL.md：入口与使用说明\n', '- scripts/：python-docx 封装脚本与依赖清单\n', '- reference/：样式与排版参考'), 1, 1, NOW(), NOW()),
    (8, 2, 0, 'scripts', 0, NULL, NULL, 1, 2, NOW(), NOW()),
    (9, 2, 0, 'reference', 0, NULL, NULL, 1, 3, NOW(), NOW());

-- Skill2 docx 子级
INSERT INTO xxl_ai_skill_file (id, skill_id, parent_id, name, `type`, file_type, content, locked, sort, add_time, update_time)
VALUES
    (10, 2, 8, 'docx.py', 1, 'py', CONCAT('"""python-docx 文档生成封装：标题/段落/表格统一样式。"""\n', 'from docx import Document\n', '\n', 'def build(title, paragraphs, table=None):\n', '    doc = Document()\n', '    doc.add_heading(title, level=0)\n', '    for para in paragraphs:\n', '        p = doc.add_paragraph(para["text"])\n', '        if para.get("bold"):\n', '            p.runs[0].bold = True\n', '    if table:\n', '        t = doc.add_table(rows=len(table), cols=len(table[0]))\n', '        for i, row in enumerate(table):\n', '            for j, cell in enumerate(row):\n', '                t.cell(i, j).text = str(cell)\n', '    return doc\n', '\n', 'def save(doc, path):\n', '    doc.save(path)'), 0, 1, NOW(), NOW()),
    (11, 2, 8, 'requirements.txt', 1, 'txt', 'python-docx>=1.1.0', 0, 2, NOW(), NOW()),
    (12, 2, 9, 'style-guide.md', 1, 'md', CONCAT('# 排版规范参考\n', '\n', '- 一级标题使用 Heading 0/1，正文 12pt 宋体\n', '- 表格使用简洁网格样式，表头加粗\n', '- 长文档使用分页符控制章节边界\n', '- 文件命名：{主题}-{yyyyMMdd}.docx'), 0, 1, NOW(), NOW());

-- Skill3 debugging 根级
INSERT INTO xxl_ai_skill_file (id, skill_id, parent_id, name, `type`, file_type, content, locked, sort, add_time, update_time)
VALUES
    (13, 3, 0, 'SKILL.md', 1, 'md', CONCAT('---\n', 'name: debugging\n', 'description: 系统化 Debug，按假设-验证循环、二分定位与日志分析定位问题根因\n', '---\n', '\n', '# debugging\n', '\n', '遵循结构化流程排查缺陷：先复现，再分域，逐步收敛到根因。\n', '\n', '## 使用方式\n', '1. 复现问题并确认输入/输出期望。\n', '2. 按 reference/debug-methodology.md 的假设-验证循环分域排查。\n', '3. 日志冗余时用 scripts/log-reducer.py 过滤去重，聚焦异常片段。\n', '4. 定位根因后输出结论与修复建议。'), 1, 1, NOW(), NOW()),
    (14, 3, 0, 'scripts', 0, NULL, NULL, 1, 2, NOW(), NOW()),
    (15, 3, 0, 'reference', 0, NULL, NULL, 1, 3, NOW(), NOW());

-- Skill3 debugging 子级
INSERT INTO xxl_ai_skill_file (id, skill_id, parent_id, name, `type`, file_type, content, locked, sort, add_time, update_time)
VALUES
    (16, 3, 14, 'log-reducer.py', 1, 'py', CONCAT('"""日志降噪工具：去掉重复行排除干扰，聚焦异常片段。"""\n', 'import sys\n', '\n', 'def reduce_log(lines):\n', '    seen = set()\n', '    for line in lines:\n', '        l = line.strip()\n', '        if l and l not in seen:\n', '            seen.add(l)\n', '            yield line\n', '\n', 'if __name__ == "__main__":\n', '    for out in reduce_log(sys.stdin):\n', '        sys.stdout.write(out)'), 0, 1, NOW(), NOW()),
    (17, 3, 15, 'debug-methodology.md', 1, 'md', CONCAT('# 调试方法论\n', '\n', '1. 复现：明确触发条件与期望输出\n', '2. 分域：输入校验 / 业务逻辑 / 数据访问 / 渲染层逐层隔离\n', '3. 假设-验证：每次只验证一个假设，优先低成本的日志/单测\n', '4. 二分定位：在失败路径上二分插桩，缩小范围\n', '5. 根因确认：修复后回归验证，避免只治症状'), 0, 1, NOW(), NOW());