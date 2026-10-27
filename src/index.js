/**
 * dsh-noisy-tang — 堂吉诃德 Agent 预设（两档）
 *
 * 本包提供两个预设，共用一份冒险手记：
 *
 *   · 堂吉诃德Agent预设·热血档   persona-hot.md      → <DSH_HOME>/tang-journal.md
 *   · 堂吉诃德Agent预设·本吾档   persona-solemn.md   → <DSH_HOME>/tang-journal.md
 *
 * 全靠 `cordis.patch.yml`（由 build-patch.mjs 从 presets.js 生成）完成：
 *   1. 两条 `@deepseek-ai/dsh-agent-preset` 声明 —— 各自的 config 就是一个预设本体
 *      （id / name / description / order / plugins），被 `agentPresets.register()`
 *      注册后即出现在 Agent 预设界面。
 *   2. 每个预设里一条 `dsh-noisy-tang` 行 —— 挂载本包 src/memory.js 的 tang-journal，
 *      把手记注册成提示变量（读）、并注册写入工具（写）。
 *
 * 与 whale-loli 的差异：两档共用同一手记（同一个骑士，换档不失忆）。
 * 变量名/工具名相同是安全的：预设 registry 一次只挂载被选中的预设，
 * 两个预设从不同时出现在同一 scope。
 *
 * 本文件同时导出预设元信息与人设正文，供构建 / 校验脚本复用。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { apply as applyMemory, inject as memoryInject, name as memoryName } from './memory.js';
import { PRESETS } from './presets.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

export { PRESETS, PRESET_IDS, presetById } from './presets.js';

/** 热血档预设 id。 */
export const PRESET_ID_HOT = PRESETS[0].id;

/** 本吾档预设 id。 */
export const PRESET_ID_SOLEMN = PRESETS[1].id;

/** 按预设 id 取人设正文 —— 校验脚本用它。 */
export function personaTextOf(presetId) {
  const p = PRESETS.find((x) => x.id === presetId);
  if (!p) throw new Error('unknown preset id: ' + presetId);
  return read(p.personaFile);
}

export {
  memoryPath,
  ensureMemoryFile,
  memorySectionText,
  parseMemory,
  composeMemory,
  renderMemory,
  pruneMemoryFile,
  appendRolling,
  nextTurnId,
  memoryStem,
  archiveDir,
  memoryTemplate,
  DEFAULT_MEMORY_FILE,
  DEFAULT_VARIABLE,
  DEFAULT_TOOL,
} from './memory.js';

/** 入口挂载：patch 里 `name: 'dsh-noisy-tang'` 的行落到这里。 */
function applyEntry(ctx, config = {}) {
  return applyMemory(ctx, config);
}

export default {
  name: 'dsh-noisy-tang',
  // `inject` 是静态声明，只能写作用域里一直存在的服务名。
  // 写不存在的服务名会让宿主一直等它、所有预设挂在 invalid 上（whale-loli 的教训）。
  inject: [...new Set([...memoryInject])],
  apply: applyEntry,
};

// 让 `tang-journal` 也能作为本包的一个入口被挂载。
export { memoryName };
export { apply as tangJournalApply } from './memory.js';
