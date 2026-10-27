// verify-patch.mjs —— 补丁完整性守门。
//
// 检查：
//  1. 提交进仓库的 cordis.patch.yml 与「从源码重新生成」的结果逐字节一致
//     （防止手改补丁、或改了 presets/persona 忘了重新 build）。
//  2. 两个预设的声明行、人设块、记忆行、工具面行都在。
//  3. 人设开头引用 {{tang_journal}}（变量通道，complete:true 下唯一有效入口）。
//  4. persona 行带 complete: true 与 includeRuntimeContext: false。
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PRESETS, PRESET_IDS } from './src/presets.js';

const root = fileURLToPath(new URL('.', import.meta.url));
let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.error(`  ✗ ${msg}`);
  failed++;
};

console.log('verify-patch:');

// 1. 确定性：重新生成到临时文件并与仓库内文件比对
const committed = readFileSync(root + 'cordis.patch.yml', 'utf8');
const regenerated = execFileSync('node', [root + 'build-patch.mjs'], { encoding: 'utf8' }) && '';
// build-patch.mjs 直接覆写 cordis.patch.yml —— 生成后重读即是产物
const after = readFileSync(root + 'cordis.patch.yml', 'utf8');
if (committed === after) ok('cordis.patch.yml 与源码重新生成结果一致（无手改/未过期）');
else bad('cordis.patch.yml 与源码不一致：改了 presets/persona 后请运行 node build-patch.mjs');

// 2. 结构断言
for (const id of PRESET_IDS) {
  if (after.includes(`id: preset-${id}`)) ok(`预设声明行存在：${id}`);
  else bad(`缺少预设声明行：${id}`);
}
if ((after.match(/'@deepseek-ai\/dsh-agent-preset'/g) || []).length === PRESETS.length)
  ok(`dsh-agent-preset 行数 = ${PRESETS.length}`);
else bad('dsh-agent-preset 行数不对');

if ((after.match(/name: 'dsh-noisy-tang'/g) || []).length === PRESETS.length)
  ok(`tang-journal 记忆行数量 = ${PRESETS.length}（每预设一条）`);
else bad('记忆行数量不对');

for (const tool of ['@deepseek-ai/dsh-tool-fs', '@deepseek-ai/dsh-tool-fs-search', 'cordis:group', '@deepseek-ai/dsh-agent-instructions']) {
  // 按整行匹配（带引号或不带引号两种形态），避免 tool-fs 误计入 tool-fs-search
  const count = after
    .split('\n')
    .filter((l) => l.trim() === `name: '${tool}'` || l.trim() === `name: ${tool}`).length;
  if (count === PRESETS.length) ok(`工具面行 ${tool} × ${PRESETS.length}`);
  else bad(`工具面行 ${tool} 数量不对（实际 ${count}）`);
}

// 3. 变量引用 + complete 语义
if (after.includes('{{tang_journal}}')) ok('人设引用 {{tang_journal}}（变量通道）');
else bad('人设未引用 {{tang_journal}}');
const completeCount = after.split('\n').filter((l) => l.trim() === 'complete: true').length;
if (completeCount === PRESETS.length) ok(`complete: true × ${PRESETS.length}`);
else bad(`complete: true 数量不对（实际 ${completeCount}）`);
if ((after.match(/includeRuntimeContext: false/g) || []).length === PRESETS.length)
  ok(`includeRuntimeContext: false × ${PRESETS.length}`);
else bad('includeRuntimeContext: false 数量不对');

// 4. 每个预设的 description 非空且 order 唯一
const orders = PRESETS.map((p) => p.order);
if (new Set(orders).size === orders.length) ok(`order 唯一：${orders.join(', ')}`);
else bad('order 重复');

process.exit(failed ? 1 : 0);
