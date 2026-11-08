/*
 * Agent 预设标识：图标 + 颜色 + 一套默认配置，供列表、编辑抽屉、会话选择器与顶栏统一使用。
 *   - avatar 只落库预设 id，图标与颜色由本表统一派生；
 *   - 图标必须使用渲染入口已全局注册的 Element Plus 图标；
 *   - 预设配置用于新建时一键完善名称 / 描述 / 指令。
 * @author xuxueli 2026-11-07
 */

/* 预设模板配置：点击预设后回填到编辑表单 */
export interface AgentPresetConfig {
  /* 描述文案 key */
  descriptionKey: string
  /* 默认指令文案 key */
  promptKey: string
}

/* 预设标识 */
export interface AgentAvatarPreset {
  /* 预设 id（落库值） */
  id: string
  /* 全局已注册的图标组件名 */
  icon: string
  /* 标识底色 */
  color: string
  /* 名称文案 key */
  labelKey: string
  /* 预设模板；缺省表示「自定义」 */
  preset?: AgentPresetConfig
}

/* 预设标识列表：顺序即选择器展示顺序 */
export const AGENT_AVATAR_PRESETS: AgentAvatarPreset[] = [
  {
    id: 'assistant',
    icon: 'MagicStick',
    color: '#00A3A3',
    labelKey: 'agent.avatar.assistant',
    preset: {
      descriptionKey: 'agent.preset.assistant.description',
      promptKey: 'agent.presets.general.prompt'
    }
  },
  {
    id: 'coder',
    icon: 'Cpu',
    color: '#2F80ED',
    labelKey: 'agent.avatar.coder',
    preset: {
      descriptionKey: 'agent.preset.coder.description',
      promptKey: 'agent.presets.coding.prompt'
    }
  },
  {
    id: 'writer',
    icon: 'Document',
    color: '#27AE60',
    labelKey: 'agent.avatar.writer',
    preset: {
      descriptionKey: 'agent.preset.writer.description',
      promptKey: 'agent.presets.writing.prompt'
    }
  },
  {
    id: 'researcher',
    icon: 'Reading',
    color: '#9B51E0',
    labelKey: 'agent.avatar.researcher',
    preset: {
      descriptionKey: 'agent.preset.researcher.description',
      promptKey: 'agent.presets.research.prompt'
    }
  },
  {
    id: 'operator',
    icon: 'Tools',
    color: '#F2994A',
    labelKey: 'agent.avatar.operator',
    preset: {
      descriptionKey: 'agent.preset.operator.description',
      promptKey: 'agent.presets.operator.prompt'
    }
  },
  {
    id: 'planner',
    icon: 'Operation',
    color: '#6E59F5',
    labelKey: 'agent.avatar.planner',
    preset: {
      descriptionKey: 'agent.preset.planner.description',
      promptKey: 'agent.presets.planner.prompt'
    }
  },
  {
    id: 'curator',
    icon: 'Notebook',
    color: '#EB5757',
    labelKey: 'agent.avatar.curator',
    preset: {
      descriptionKey: 'agent.preset.curator.description',
      promptKey: 'agent.presets.curator.prompt'
    }
  },
  {
    id: 'companion',
    icon: 'ChatDotRound',
    color: '#D4A017',
    labelKey: 'agent.avatar.companion',
    preset: {
      descriptionKey: 'agent.preset.companion.description',
      promptKey: 'agent.presets.companion.prompt'
    }
  },
  {
    id: 'custom',
    icon: 'EditPen',
    color: '#8A8F99',
    labelKey: 'agent.avatar.custom'
  }
]

/* 按 id 查找预设：非法值回退默认标识 */
export function resolveAgentAvatar(id: string): AgentAvatarPreset {
  return AGENT_AVATAR_PRESETS.find((item) => item.id === id) ?? AGENT_AVATAR_PRESETS[0]
}
