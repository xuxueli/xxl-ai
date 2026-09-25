package com.xxl.ai.api.business.chat.model.adaptor;

import com.xxl.ai.api.business.chat.model.dto.ChatConvDTO;
import com.xxl.ai.api.business.chat.model.entity.ChatConv;
import com.xxl.tool.core.DateTool;

/**
 * 对话 适配器（实体 → DTO）
 *
 * @author xxl-ai 2026-09-19
 */
public class ChatConvAdaptor {

    /**
     * 实体转 DTO（时间格式化为字符串）
     */
    public static ChatConvDTO adapt2dto(ChatConv chatConv) {
        if (chatConv == null) {
            return null;
        }
        ChatConvDTO dto = new ChatConvDTO();
        dto.setId(chatConv.getId());
        dto.setAgentUuid(chatConv.getAgentUuid());
        dto.setVisitorId(chatConv.getVisitorId());
        dto.setTitle(chatConv.getTitle());
        dto.setAddTime(DateTool.formatDateTime(chatConv.getAddTime()));
        dto.setUpdateTime(DateTool.formatDateTime(chatConv.getUpdateTime()));
        return dto;
    }

}
