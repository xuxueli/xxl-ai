package com.xxl.ai.api.business.skill.model.entity;

import java.util.Date;

/**
 * SKILL 内容文件实体（文件树节点：目录 or 文件）
 *
 * @author xxl-ai 2026-09-06
 */
public class SkillFile {

    private long id;            /* 文件ID */
    private long skillId;       /* SKILL ID */
    private long parentId;      /* 父目录ID（0为根级） */
    private String name;        /* 文件/目录名称 */
    private int type;           /* 类型：0-目录、1-文件 */
    private String fileType;    /* 文件类型（扩展名，目录为空） */
    private String content;     /* 文件内容（目录为空） */
    private int locked;         /* 是否固定：0-否、1-是（不可删除/改名/移动） */
    private int sort;           /* 排序 */
    private Date addTime;       /* 新增时间 */
    private Date updateTime;    /* 更新时间 */

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public long getSkillId() {
        return skillId;
    }

    public void setSkillId(long skillId) {
        this.skillId = skillId;
    }

    public long getParentId() {
        return parentId;
    }

    public void setParentId(long parentId) {
        this.parentId = parentId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public int getType() {
        return type;
    }

    public void setType(int type) {
        this.type = type;
    }

    public String getFileType() {
        return fileType;
    }

    public void setFileType(String fileType) {
        this.fileType = fileType;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public int getLocked() {
        return locked;
    }

    public void setLocked(int locked) {
        this.locked = locked;
    }

    public int getSort() {
        return sort;
    }

    public void setSort(int sort) {
        this.sort = sort;
    }

    public Date getAddTime() {
        return addTime;
    }

    public void setAddTime(Date addTime) {
        this.addTime = addTime;
    }

    public Date getUpdateTime() {
        return updateTime;
    }

    public void setUpdateTime(Date updateTime) {
        this.updateTime = updateTime;
    }

}