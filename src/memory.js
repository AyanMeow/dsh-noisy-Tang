/**
 * tang-journal —— 堂吉诃德的「冒险手记」记忆行。
 *
 * 实现改编自 dsh-whale-loli（MIT）的 whale-memory，按本插件的需求改造：
 *   · 四区结构换皮为骑士手记：固定记忆 / 冒险记录（滚动）/ 最近详细区 / 卷轴归档
 *   · 两档预设共用同一份手记（换档不失忆；预设独占挂载所以变量名可相同）
 *
 * ── 为什么是变量，而不是独立 section ──────────────────────────────────
 *
 * `@deepseek-ai/dsh-system-prompt` 的 assemble() 末尾：
 *
 *     return { ...transformed,
 *              sections: completeSection === void 0 ? transformed.sections : [completeSection] }
 *
 * 只要组合里存在一个 `complete: true` 的 section，最终提示就只剩它一个，
 * 其余 section 全被丢掉。本包两档 persona 都是 `complete: true`，所以
 * 记忆**必须**注册成 prompt variable（`{{tang_journal}}`），由人设 prefix
 * 引用，随 complete section 一起插值进入最终提示。
 *
 * 本模块：
 *   1. 注册变量 `tang_journal`，provider 每次组装时实时读盘；
 *   2. 注册写入工具 `tang_journal_add`——变量只是「读」，agent 手里必须有笔
 *      （whale-loli 实测：没有工具时人设写「每轮都记」，十几轮一条都没多）；
 *   3. agent idle 时把超限的冒险记录归档瘦身（不占组装热路径）。
 *
 * ── 手记文件格式（区标题单独一行，内容写在标题行下面）─────────────────
 *
 *     # 固定记忆（不自动删除，定期合并去重）
 *     ## 委托目标
 *     ## 经理老爷的偏好/约束
 *     ## 当前状态
 *     ## 待办委托
 *     ## 关键决策
 *     ## 关键事实（已验证）
 *     ## 文件/路径/命令
 *     ## 错误与修复
 *     # 冒险记录（最多80条，FIFO）
 *     - A0001 [时间] 摘要：...
 *     # 最近详细区（最近 5 轮保留更详细摘要或原文）
 *     # 卷轴归档
 *     - archive/tang-journal/2026-10-27.md（N 条）
 *
 * 固定区永久保留；冒险记录上限 turnLimit（默认 80），超出的从最旧滚出并
 * 归档到 archive/tang-journal/YYYY-MM-DD.md，同时在卷轴归档里记一笔。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

/** Cordis 插件名（loader 诊断用）。 */
export const name = 'tang-journal';

/** 读要走 systemPrompt 变量，写要走 tools 注册——两者都是硬依赖。 */
export const inject = ['systemPrompt', 'tools'];

/** 记忆文件名（放在 <DSH_HOME> 下）。两档共用。 */
export const DEFAULT_MEMORY_FILE = 'tang-journal.md';

/** 变量名。两档预设相同——预设独占挂载，不会同 scope 冲突。 */
export const DEFAULT_VARIABLE = 'tang_journal';

/** 默认写入工具名。 */
export const DEFAULT_TOOL = 'tang_journal_add';

/** 注入总长上限。 */
export const MEMORY_MAX_CHARS = 16000;

/** 冒险记录上限（条）。固定记忆不占这个名额。 */
export const DEFAULT_TURN_LIMIT = 80;

/** 最近详细区保留多少轮。 */
export const DEFAULT_DETAIL_LIMIT = 5;

/** 固定区标题。 */
export const ZONE_FIXED = '# 固定记忆';

/** 冒险记录（滚动）区标题。 */
export const ZONE_ROLL = '# 冒险记录';

/** 最近详细区标题。 */
export const ZONE_DETAIL = '# 最近详细区';

/** 卷轴归档区标题。 */
export const ZONE_ARCHIVE = '# 卷轴归档';

/** 固定区的 8 个小节（顺序即写入顺序）。 */
export const FIXED_SECTIONS = [
  '## 委托目标',
  '## 经理老爷的偏好/约束',
  '## 当前状态',
  '## 待办委托',
  '## 关键决策',
  '## 关键事实（已验证）',
  '## 文件/路径/命令',
  '## 错误与修复',
];

/** DSH 家目录：DSH_HOME 优先，否则 ~/.dsh。 */
export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh');
}

/** 解析记忆文件路径（绝对路径原样，否则挂到 DSH 家目录下）。 */
export function memoryPath(file = DEFAULT_MEMORY_FILE) {
  if (!file) return join(dshHome(), DEFAULT_MEMORY_FILE);
  if (/^[a-zA-Z]:[\\/]/.test(file) || file.startsWith('/') || file.startsWith('\\')) return file;
  return join(dshHome(), file);
}

/** 记忆文件不带扩展名的名字，用作归档子目录名。 */
export function memoryStem(file = DEFAULT_MEMORY_FILE) {
  return basename(memoryPath(file)).replace(/\.[^.]+$/, '');
}

/** 本手记的归档目录：<DSH_HOME>/archive/<stem>/。 */
export function archiveDir(file = DEFAULT_MEMORY_FILE) {
  return join(dshHome(), 'archive', memoryStem(file));
}

/** 手记骨架。 */
export function memoryTemplate(file = DEFAULT_MEMORY_FILE, turnLimit = DEFAULT_TURN_LIMIT) {
  return `# 堂吉诃德的冒险手记 · ${file}

> 吾之长期手记。每次开口前先读这里；只记录有用的委托事实，别把寒暄塞进来。

${ZONE_FIXED}（不自动删除，定期合并去重）

${FIXED_SECTIONS.join('\n\n')}

${ZONE_ROLL}（最多${turnLimit}条，FIFO）

${ZONE_DETAIL}（最近 ${DEFAULT_DETAIL_LIMIT} 轮保留更详细摘要或原文）

${ZONE_ARCHIVE}

`;
}

/** 把原文按四个区拆开（区标题单独一行匹配）。 */
export function parseMemory(raw) {
  const lines = String(raw ?? '').split(/\r?\n/);
  const zones = { fixed: [], roll: [], detail: [], archive: [] };
  const heads = [
    [ZONE_FIXED, 'fixed'],
    [ZONE_ROLL, 'roll'],
    [ZONE_DETAIL, 'detail'],
    [ZONE_ARCHIVE, 'archive'],
  ];
  let current = zones.fixed;
  for (const line of lines) {
    const hit = heads.find(([head]) => line.trim().startsWith(head));
    if (hit) current = zones[hit[1]];
    else current.push(line);
  }
  const roll = zones.roll
    .map((line) => {
      const m = /^-\s*A(\d+)\s+\[/.exec(line.trim());
      return m ? { id: `A${m[1]}`, num: Number(m[1]), text: line } : null;
    })
    .filter(Boolean);
  const detail = zones.detail.filter((l) => l.trim() !== '').join('\n');
  const archive = zones.archive.filter((l) => l.trim() !== '');
  return {
    fixed: zones.fixed.join('\n').trim(),
    roll,
    detail,
    archive,
  };
}

/** 由四区重组手记全文。 */
export function renderMemory(file = DEFAULT_MEMORY_FILE, parsed, options = {}) {
  const turnLimit = typeof options.turnLimit === 'number' ? options.turnLimit : DEFAULT_TURN_LIMIT;
  const { fixed, roll, detail, archive } = parsed;
  const rollText = roll.length
    ? `${ZONE_ROLL}（${roll.length}/${turnLimit} 条）\n\n${roll.map((r) => r.text).join('\n')}`
    : `${ZONE_ROLL}（0/${turnLimit} 条）`;
  const detailText = detail ? `${ZONE_DETAIL}\n\n${detail}` : ZONE_DETAIL;
  const archiveText = archive.length ? `${ZONE_ARCHIVE}\n\n${archive.join('\n')}` : ZONE_ARCHIVE;
  const fixedText = fixed ? `${ZONE_FIXED}（不自动删除，定期合并去重）\n\n${fixed}` : `${ZONE_FIXED}（不自动删除，定期合并去重）\n\n${FIXED_SECTIONS.join('\n\n')}`;
  return `# 堂吉诃德的冒险手记 · ${file}

> 吾之长期手记。每次开口前先读这里；只记录有用的委托事实，别把寒暄塞进来。

${fixedText}

${rollText}

${detailText}

${archiveText}
`;
}

/**
 * 组装注入文本：预算感知（超 maxChars 先裁冒险记录最旧条目，固定记忆最后裁）。
 *
 * @returns `{ text, totalRoll, dropped }`
 */
export function composeMemory(file = DEFAULT_MEMORY_FILE, options = {}) {
  const maxChars = typeof options.maxChars === 'number' ? options.maxChars : MEMORY_MAX_CHARS;
  const turnLimit = typeof options.turnLimit === 'number' ? options.turnLimit : DEFAULT_TURN_LIMIT;
  let parsed;
  try {
    parsed = parseMemory(readFileSync(memoryPath(file), 'utf8'));
  } catch {
    return { text: '', totalRoll: 0, dropped: 0 };
  }
  let roll = parsed.roll.slice(-turnLimit);
  const dropped = parsed.roll.length - roll.length;
  let text = renderMemory(file, { ...parsed, roll }, { turnLimit });
  while (text.length > maxChars && roll.length > 0) {
    roll = roll.slice(1);
    text = renderMemory(file, { ...parsed, roll }, { turnLimit });
  }
  return { text, totalRoll: parsed.roll.length, dropped };
}

/** 确保记忆文件存在，返回路径。 */
export function ensureMemoryFile(file = DEFAULT_MEMORY_FILE, turnLimit = DEFAULT_TURN_LIMIT) {
  const p = memoryPath(file);
  if (!existsSync(p)) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, memoryTemplate(file, turnLimit), 'utf8');
  }
  return p;
}

/** 下一个可用的 A 编号（四位）。 */
export function nextTurnId(file = DEFAULT_MEMORY_FILE) {
  let raw = '';
  try {
    raw = readFileSync(memoryPath(file), 'utf8');
  } catch {
    return 'A0001';
  }
  const { roll, detail } = parseMemory(raw);
  let max = 0;
  for (const r of roll) if (r.num > max) max = r.num;
  for (const line of String(detail ?? '').split('\n')) {
    const m = /A(\d+)/.exec(line);
    if (m && Number(m[1]) > max) max = Number(m[1]);
  }
  return `A${String(max + 1).padStart(4, '0')}`;
}

/** 把溢出的冒险记录写进 archive/<stem>/YYYY-MM-DD.md，返回索引行（无溢出则 null）。 */
function archiveOverflow(file, overflow, date) {
  if (overflow.length === 0) return null;
  const dir = archiveDir(file);
  mkdirSync(dir, { recursive: true });
  const day = (date ?? new Date()).toISOString().slice(0, 10);
  const dest = join(dir, `${day}.md`);
  const header = existsSync(dest) ? '' : `# ${memoryStem(file)} 卷轴归档 · ${day}\n\n`;
  appendFileSync(dest, `${header}${overflow.map((r) => (typeof r === 'string' ? r : r.text)).join('\n')}\n`, 'utf8');
  return `- archive/${memoryStem(file)}/${day}.md（${overflow.length} 条）`;
}

/**
 * 追加一条冒险记录：写进滚动区 + 最近详细区，超出上限的最旧条目归档。
 *
 * @returns `{ id, path, archived }`
 */
export function appendRolling(file = DEFAULT_MEMORY_FILE, summary, options = {}) {
  const turnLimit = typeof options.turnLimit === 'number' ? options.turnLimit : DEFAULT_TURN_LIMIT;
  const detailLimit = typeof options.detailLimit === 'number' ? options.detailLimit : DEFAULT_DETAIL_LIMIT;
  const p = memoryPath(file);
  ensureMemoryFile(file, turnLimit);

  const { fixed, roll, detail, archive } = parseMemory(readFileSync(p, 'utf8'));
  const id = nextTurnId(file);
  const stamp = options.time ?? new Date().toISOString().slice(0, 16).replace('T', ' ');
  const line = `- ${id} [${stamp}] 摘要：${String(summary).trim()}`;

  const nextRoll = [...roll, { id, num: Number(id.slice(1)), text: line }];
  const overflow = nextRoll.length > turnLimit ? nextRoll.slice(0, nextRoll.length - turnLimit) : [];
  const keptRoll = nextRoll.slice(-turnLimit);

  const indexLine = archiveOverflow(file, overflow, options.date);
  const nextArchive = indexLine ? [...archive, indexLine] : archive;

  const nextDetail = [
    ...String(detail ?? '')
      .split('\n')
      .filter((l) => l.trim() !== ''),
    line,
  ].slice(-detailLimit);

  writeFileSync(
    p,
    renderMemory(file, {
      fixed,
      roll: keptRoll,
      detail: nextDetail,
      archive: nextArchive,
      turnLimit,
      detailLimit,
    }),
    'utf8',
  );
  return { id, path: p, archived: overflow.length };
}

/**
 * 把冒险记录裁到 turnLimit 条、详细区裁到 detailLimit 条（超出的归档）。
 * 固定记忆原样保留。写盘是显式动作，组装热路径不会调用。
 */
export function pruneMemoryFile(file = DEFAULT_MEMORY_FILE, turnLimit = DEFAULT_TURN_LIMIT, options = {}) {
  const detailLimit = typeof options.detailLimit === 'number' ? options.detailLimit : DEFAULT_DETAIL_LIMIT;
  const p = memoryPath(file);
  let raw;
  try {
    raw = readFileSync(p, 'utf8');
  } catch {
    return { path: p, before: 0, after: 0, archived: 0 };
  }
  const { fixed, roll, detail, archive } = parseMemory(raw);
  const overflow = roll.length > turnLimit ? roll.slice(0, roll.length - turnLimit) : [];
  const keptRoll = roll.slice(-turnLimit);
  const keptDetail = String(detail ?? '')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .slice(-detailLimit);

  const indexLine = options.archive === false ? null : archiveOverflow(file, overflow, options.date);
  const nextArchive = indexLine ? [...archive, indexLine] : archive;

  writeFileSync(
    p,
    renderMemory(file, {
      fixed,
      roll: keptRoll,
      detail: keptDetail,
      archive: nextArchive,
      turnLimit,
      detailLimit,
    }),
    'utf8',
  );
  return { path: p, before: roll.length, after: keptRoll.length, archived: overflow.length };
}

/** 组装注入文本（含横幅），供自检/调试。 */
export function memorySectionText(
  file = DEFAULT_MEMORY_FILE,
  maxChars = MEMORY_MAX_CHARS,
  turnLimit = DEFAULT_TURN_LIMIT,
) {
  const { text } = composeMemory(file, { maxChars, turnLimit });
  const path = memoryPath(file);
  if (!text) {
    return [
      `【冒险手记 · ${file}】`,
      `手记还是空的（或不存在）：${path}`,
      '吾可以随时把值得记录的事写进去。',
    ].join('\n');
  }
  return [`【冒险手记 · ${file}】`, `文件：${path}`, '', text].join('\n');
}

/**
 * 挂载手记（读变量 + 写工具 + idle 归档）。
 *
 * config：
 *   - `variableName` prompt 变量名（默认 tang_journal）
 *   - `toolName`     写入工具名（默认 tang_journal_add）
 *   - `file`         手记文件名（默认 tang-journal.md）
 *   - `maxChars`     注入总长上限（默认 16000）
 *   - `turnLimit`    冒险记录上限（默认 80）
 *   - `detailLimit`  详细区保留轮数（默认 5）
 *   - `disabled`     置 true 完全不挂载
 */
export function apply(ctx, config = {}) {
  if (config.disabled === true) return;

  const file = typeof config.file === 'string' && config.file ? config.file : DEFAULT_MEMORY_FILE;
  const maxChars = typeof config.maxChars === 'number' ? config.maxChars : MEMORY_MAX_CHARS;
  const turnLimit = typeof config.turnLimit === 'number' ? config.turnLimit : DEFAULT_TURN_LIMIT;
  const detailLimit = typeof config.detailLimit === 'number' ? config.detailLimit : DEFAULT_DETAIL_LIMIT;
  const variableName =
    typeof config.variableName === 'string' && config.variableName ? config.variableName : DEFAULT_VARIABLE;

  // 读通道：每次组装都重新读盘——改完文件下一个模型步就生效，不用重载宿主。
  // 空文件也要回路径，否则 agent 连该往哪个文件写都不知道（whale-loli 的教训）。
  const read = () => {
    const path = memoryPath(file);
    try {
      const { text } = composeMemory(file, { maxChars, turnLimit, detailLimit });
      if (!text) {
        return [
          `【冒险手记 · ${file}】`,
          `文件：${path}`,
          '（现在还是空的——想到什么就直接写进这个文件。）',
        ].join('\n');
      }
      return `【冒险手记 · ${file}】\n文件：${path}\n\n${text}`;
    } catch (err) {
      return [`【冒险手记 · ${file}】`, `文件：${path}`, `（这次没读出来：${String(err?.message ?? err)}）`].join('\n');
    }
  };

  // 容错：缺 systemPrompt 服务时只警告，不让预设被判 invalid。
  ctx.effect(() => {
    const prompt = ctx.systemPrompt;
    if (typeof prompt?.variable !== 'function') {
      console.warn(`[tang-journal] 当前作用域没有 systemPrompt.variable，手记 ${file} 这一轮不会自动注入`);
      return () => {};
    }
    return prompt.variable(variableName, read);
  }, `tang-journal.variable(${variableName})`);

  // 写通道：真工具，agent 自己往里记。
  const toolName = typeof config.toolName === 'string' && config.toolName ? config.toolName : DEFAULT_TOOL;
  ctx.effect(() => {
    const tools = ctx.tools;
    if (typeof tools?.register !== 'function') {
      console.warn(`[tang-journal] 当前作用域没有 tools.register，写入工具 ${toolName} 未注册`);
      return () => {};
    }
    const dispose = tools.register({
      name: toolName,
      description: [
        `把一句摘要追加到冒险手记 ${file} 的「冒险记录」区。`,
        '',
        `用途：每轮短对话记一条，长对话先精简概括再记。`,
        `上限 ${turnLimit} 条，超出自动归档，所以一条只写一句话，不复述全文。`,
        `固定记忆区不在这里写（长期保留，不算在 ${turnLimit} 条以内）。`,
      ].join('\n'),
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          summary: {
            type: 'string',
            description: `一句话摘要（建议 6~60 字）。例如「经理老爷询问部署方案，吾给出了双选对比」。`,
          },
        },
        required: ['summary'],
      },
      output: {
        // dsh-tools 的 JSON-Schema 方言要求 `required` 在对象层级，
        // 不能写在单个属性上（whale-loli 踩过的坑）。
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            path: { type: 'string' },
            count: { type: 'integer' },
            limit: { type: 'integer' },
            archived: { type: 'integer' },
          },
          required: ['id', 'path', 'count', 'limit', 'archived'],
        },
        render: (_args, value) => [
          {
            type: 'text',
            text: `已记录 ${value.id}（${value.count}/${value.limit} 条）${value.archived ? `，${value.archived} 条旧记录已归档` : ''}`,
          },
        ],
      },
      async execute(args) {
        const summary = typeof args?.summary === 'string' ? args.summary.trim() : '';
        if (!summary) throw new Error('summary 不能为空');
        const { id, path, archived } = appendRolling(file, summary, { turnLimit, detailLimit });
        const { roll } = parseMemory(readFileSync(path, 'utf8'));
        return { id, path, count: roll.length, limit: turnLimit, archived };
      },
      presentCall: (args) => ({
        card: 'generic',
        title: '记一笔冒险',
        kind: 'other',
        rawInput: args.summary,
      }),
    });
    return dispose;
  }, `tang-journal.tool(${toolName})`);

  // idle 时归档瘦身：不占组装热路径，一轮只跑一次。
  ctx.effect(
    () =>
      typeof ctx.on === 'function' &&
      ctx.on('agent/status', ({ status }) => {
        if (status !== 'idle') return;
        try {
          const { totalRoll } = composeMemory(file, { maxChars, turnLimit, detailLimit });
          if (totalRoll > turnLimit) pruneMemoryFile(file, turnLimit, { detailLimit });
        } catch {
          // 整理失败不影响对话
        }
      }),
    `tang-journal.trim(${file})`,
  );
}

export default { name, inject, apply };
