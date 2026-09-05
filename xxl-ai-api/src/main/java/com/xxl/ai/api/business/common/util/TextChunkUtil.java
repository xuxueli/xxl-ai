package com.xxl.ai.api.business.common.util;

import java.util.ArrayList;
import java.util.List;

/**
 * 文本分片工具
 *
 * 按指定 chunkSize 与 chunkOverlap 对长文本做字符级分片
 *
 * @author xxl-ai 2026-09-05
 */
public class TextChunkUtil {

    /**
     * 文本分片
     *
     * @param content     原始文本
     * @param chunkSize   分片大小
     * @param chunkOverlap 分片重叠
     * @return 分片列表
     */
    public static List<String> split(String content, int chunkSize, int chunkOverlap) {
        List<String> chunks = new ArrayList<>();
        if (content == null || content.isEmpty()) {
            return chunks;
        }
        int size = Math.max(chunkSize, 1);
        int overlap = Math.min(Math.max(chunkOverlap, 0), size - 1);
        int length = content.length();
        int start = 0;
        while (start < length) {
            int end = Math.min(start + size, length);
            chunks.add(content.substring(start, end));
            if (end >= length) {
                break;
            }
            start = end - overlap;
        }
        return chunks;
    }

}