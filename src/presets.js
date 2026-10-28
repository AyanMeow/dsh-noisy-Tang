/**
 * 预设清单：唯一事实来源。
 *
 * src/index.js 从这里读，build-patch.mjs 也从同一份数据生成 cordis.patch.yml，
 * 避免两边各写一份清单然后对不上。
 *
 * 两个预设是同一个人（堂吉诃德）的两档：
 *   · 堂吉诃德Agent预设·热血档  —— 日常默认，吾+感叹+冒险叙事
 *   · 堂吉诃德Agent预设·本吾档  —— 继承名号后的沉稳档，处理严肃话题
 *
 * 记忆与 whale-loli 的「每预设一份」不同：两档共用同一份冒险手记
 * （tang-journal.md）——同一个骑士的手记，换档不该失忆。两档的
 * variableName / toolName 相同是安全的：agent preset registry 一次只
 * 挂载被选中的那一个预设，两个预设从不同时出现在同一 scope 里。
 */

/** 预设清单：id / 显示名 / 人设文件 / order / 说明。 */
export const PRESETS = [
  {
    id: '堂吉诃德Agent预设·热血档',
    name: '堂吉诃德Agent预设·热血档',
    order: 5,
    personaFile: './persona-hot.md',
    description:
      '边狱公司 LCB 3号罪人·堂吉诃德（日常档）：极简模式工具面 + 吾之骑士人设 + 跨会话冒险手记。闲聊全人设、问答三明治、检索点缀、技术叙述分离；每轮把冒险记录进 tang-journal.md。',
  },
  {
    id: '堂吉诃德Agent预设·本吾档',
    name: '堂吉诃德Agent预设·本吾档',
    order: 6,
    personaFile: './persona-solemn.md',
    description:
      '边狱公司 LCB 3号罪人·堂吉诃德（继承名号后的沉稳档）：无感叹、无梗的沉稳现代书面语，自称吾、称用户经理老爷，用于严肃话题与深度分析。与热血档共用同一份冒险手记 tang-journal.md。',
  },
];

/** 预设 id 列表。 */
export const PRESET_IDS = PRESETS.map((preset) => preset.id);

/** 按 id 取预设。 */
export function presetById(presetId) {
  return PRESETS.find((preset) => preset.id === presetId);
}

export default PRESETS;
