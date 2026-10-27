// verify-memory.mjs —— 冒险手记记忆系统单测（临时 DSH_HOME，跑完即删）。
//
// 覆盖：骨架生成、解析-重组往返、编号递增、80 条 FIFO 与归档、
// 预算裁剪（超 maxChars 先裁冒险记录）、prune、挂载（变量+工具+idle瘦身）。
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

console.log('verify-memory:');
let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.error(`  ✗ ${msg}`);
  failed++;
};

const home = mkdtempSync(join(tmpdir(), 'tang-verify-'));
process.env.DSH_HOME = home;

// 动态 import 让 DSH_HOME 先生效
const mem = await import('./src/memory.js');

try {
  // 1. 骨架
  const p = mem.ensureMemoryFile();
  if (existsSync(p)) ok(`骨架生成：${p}`);
  else bad('骨架未生成');

  // 2. 往返：写入 → 解析 → 四区齐全
  mem.appendRolling(undefined, '第一条：委托调查开始');
  mem.appendRolling(undefined, '第二条：闲聊称赞骑枪');
  const parsed = mem.parseMemory(readFileSync(p, 'utf8'));
  if (parsed.roll.length === 2) ok('解析-重组往返：2 条冒险记录');
  else bad(`往返条数不对：${parsed.roll.length}`);
  if (parsed.fixed.includes('## 委托目标')) ok('固定记忆 8 小节在位（抽查 委托目标）');
  else bad('固定记忆小节缺失');

  // 3. 编号递增
  if ((await mem.nextTurnId()) === 'A0003') ok('编号递增 A0001→A0003');
  else bad('编号递增错误');

  // 3.5 回归：头部不得随写入堆积（真机翻过车的 bug）
  {
    const raw = readFileSync(p, 'utf8');
    const headers = (raw.match(/^# 堂吉诃德的冒险手记/gm) || []).length;
    if (headers === 1) ok(`头部唯一（写入 ${2} 次后仍为 ${headers} 份）`);
    else bad(`头部重复堆积：${headers} 份`);
    // 幂等：parse(render(parse(x))) === parse(x)
    const p1 = mem.parseMemory(raw);
    const p2 = mem.parseMemory(mem.renderMemory(undefined, p1));
    const same =
      p1.fixed === p2.fixed &&
      p1.roll.length === p2.roll.length &&
      p1.detail === p2.detail &&
      p1.archive.length === p2.archive.length;
    if (same) ok('parse/render 幂等（重组不再增殖内容）');
    else bad('parse/render 不幂等：每写一次都会增殖');
    // 自愈：旧损坏文件（头部混入 fixed）解析后被剔除
    const corrupted = `# 堂吉诃德的冒险手记 · tang-journal.md\n\n> 吾之长期手记。\n\n${mem.ZONE_FIXED}\n\n## 委托目标\n\n# 堂吉诃德的冒险手记 · tang-journal.md\n\n> 吾之长期手记。\n\n## 委托目标\n\n${mem.ZONE_ROLL}\n\n- A0001 [t] 摘要：x\n`;
    const healed = mem.parseMemory(corrupted);
    if (!healed.fixed.includes('堂吉诃德的冒险手记')) ok('损坏文件自愈：混入 fixed 的横幅被剔除');
    else bad('自愈失败：fixed 仍含横幅');
  }

  // 4. FIFO + 归档：上限 3 条（appendRolling 必须显式带 turnLimit，与 apply 的 execute 一致）
  mem.pruneMemoryFile(undefined, 3);
  mem.appendRolling(undefined, '第三条', { turnLimit: 3 });
  mem.appendRolling(undefined, '第四条', { turnLimit: 3, date: new Date() });
  const after4 = mem.parseMemory(readFileSync(p, 'utf8'));
  if (after4.roll.length === 3 && after4.roll[0].id === 'A0002')
    ok('FIFO：上限 3 条，最旧滚出（A0001 → 归档）');
  else bad(`FIFO 不对：${after4.roll.map((r) => r.id).join(',')}`);
  const archiveDir = join(home, 'archive', 'tang-journal');
  const day = new Date().toISOString().slice(0, 10);
  if (existsSync(join(archiveDir, `${day}.md`))) ok('卷轴归档文件生成');
  else bad('归档文件未生成');
  if (after4.archive.some((l) => l.includes(`${day}.md`))) ok('卷轴归档索引在位');
  else bad('归档索引缺失');

  // 5. 预算裁剪：预算压到「骨架+20字」时，先裁光冒险记录条目、固定区结构保留到最后
  {
    const home2 = mkdtempSync(join(tmpdir(), 'tang-budget-'));
    process.env.DSH_HOME = home2;
    const mem2 = await import('./src/memory.js?budget');
    mem2.ensureMemoryFile();
    const skeleton = mem2.composeMemory(undefined, { maxChars: 999999 }).text.length;
    mem2.appendRolling(undefined, '这是一条足够长的冒险记录摘要用于撑爆预算限制测试一二三四五六', { turnLimit: 80 });
    mem2.appendRolling(undefined, '这是第二条足够长的冒险记录摘要继续撑大注入文本长度', { turnLimit: 80 });
    const budget = mem2.composeMemory(undefined, { maxChars: skeleton + 20 });
    if (!/- A\d{4} \[/.test(budget.text) && budget.text.includes('# 固定记忆'))
      ok(`预算裁剪：骨架 ${skeleton} 字、预算 ${skeleton + 20} 字 → 条目全裁、固定区保留`);
    else bad('预算裁剪行为不对（应先裁条目、保固定区）');
    rmSync(home2, { recursive: true, force: true });
    process.env.DSH_HOME = home;
  }

  // 6. 挂载：mock ctx 验证变量注册 + 工具注册（schema 的 required 在对象层级）
  let varName = null;
  let toolDef = null;
  let idleHandler = null;
  const ctx = {
    effect: (fn) => fn(),
    systemPrompt: { variable: (n, fn) => { varName = n; if (typeof fn() === 'string') ok(`变量 ${n} 的 provider 返回字符串`); else bad('provider 未返回字符串'); return () => {}; } },
    tools: { register: (def) => { toolDef = def; return () => {}; } },
    on: (evt, fn) => { if (evt === 'agent/status') idleHandler = fn; return () => {}; },
  };
  mem.apply(ctx, {});
  if (varName === 'tang_journal') ok('挂载：变量 tang_journal 注册');
  else bad('变量名不对');
  if (toolDef?.name === 'tang_journal_add') ok('挂载：工具 tang_journal_add 注册');
  else bad('工具未注册');
  if (toolDef && Array.isArray(toolDef.parameters?.required) && toolDef.parameters.required.includes('summary'))
    ok('工具 schema：required 在对象层级（dsh-tools 方言）');
  else bad('工具 schema：required 位置错误');
  if (toolDef && Array.isArray(toolDef.output?.schema?.required))
    ok('工具 output schema：required 在对象层级');
  else bad('工具 output schema：required 位置错误');
  if (typeof toolDef?.execute === 'function') {
    const res = await toolDef.execute({ summary: '工具写入测试' });
    if (res.id && res.path && typeof res.count === 'number') ok(`工具 execute → ${res.id}（${res.count}/${res.limit}）`);
    else bad('工具 execute 返回结构不对');
  } else bad('工具无 execute');

  // 7. idle 瘦身：apply 配置 turnLimit:3 的第二个实例，超限时 prune
  let idle3 = null;
  const ctx3 = {
    effect: (fn) => fn(),
    systemPrompt: { variable: () => () => {} },
    tools: { register: () => () => {} },
    on: (evt, fn) => { if (evt === 'agent/status') idle3 = fn; return () => {}; },
  };
  mem.apply(ctx3, { turnLimit: 3 });
  mem.appendRolling(undefined, '第五条', { turnLimit: 3 });
  mem.appendRolling(undefined, '第六条', { turnLimit: 3 });
  if (typeof idle3 === 'function') {
    idle3({ status: 'idle' });
    const afterIdle = mem.parseMemory(readFileSync(p, 'utf8'));
    if (afterIdle.roll.length <= 3) ok('idle 瘦身：超限记录被归档');
    else bad(`idle 瘦身未生效：${afterIdle.roll.length} 条`);
  } else bad('未注册 agent/status idle 处理器');
} finally {
  rmSync(home, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
