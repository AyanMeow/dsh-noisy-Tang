// verify-persona-rules.mjs —— 人设浓度规则与硬性红线守门（本插件独有）。
//
// 人设浓度规则是本插件区别于一般人设包的核心资产：
// 闲聊全人设 / 问答三明治 / 检索点缀 / 技术叙述分离 / 严肃本吾档 + 五条硬性红线。
// 这些规则被人设正文之外的改动悄悄删掉时不会有任何报错，所以钉成断言。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PRESETS } from './src/presets.js';

const root = fileURLToPath(new URL('.', import.meta.url));
let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.error(`  ✗ ${msg}`);
  failed++;
};

console.log('verify-persona-rules:');

const hot = readFileSync(root + 'src/persona-hot.md', 'utf8');
const solemn = readFileSync(root + 'src/persona-solemn.md', 'utf8');

// 1. 热血档：浓度分档齐全
for (const tier of ['浓度5 全人设', '浓度4 三明治轻', '浓度3 三明治', '浓度2 点缀', '浓度1 叙述分离']) {
  if (hot.includes(tier)) ok(`热血档：${tier}`);
  else bad(`热血档缺少分档「${tier}」`);
}
if (hot.includes('长度反比律')) ok('热血档：长度反比律');
else bad('热血档缺少长度反比律');

// 2. 两档：五条硬性红线（本吾档允许以合并句式表述，检查关键词）
const redLines = [
  ['事实零篡改', '事实零篡改'],
  ['格式零污染', '格式零污染'],
  ['诚实优先', '诚实优先'],
  ['追问', '追问'],
  ['思维链不表演', '思维链不表演'],
];
for (const [hotKey, key] of redLines) {
  if (hot.includes(hotKey)) ok(`热血档红线：${hotKey}`);
  else bad(`热血档缺少红线「${hotKey}」`);
  if (solemn.includes(key)) ok(`本吾档红线：${key}`);
  else bad(`本吾档缺少红线「${key}」`);
}

// 3. 称呼与自称契约
for (const [name, text] of [['热血档', hot], ['本吾档', solemn]]) {
  if (text.includes('经理老爷。一律这么称呼，不换')) ok(`${name}：称呼钉死「经理老爷」`);
  else bad(`${name}：称呼契约缺失`);
  if (text.includes('LIMBUS_SINNER_03')) ok(`${name}：3号罪人标识`);
  else bad(`${name}：LIMBUS_SINNER_03 缺失`);
}

// 4. 彩蛋频次硬约束（低频承诺，写进正文才算数）
if (hot.includes('每 20 轮对话最多自然出现 1 次') && hot.includes('同一会话至多 2 次'))
  ok('热血档：血魔彩蛋频次硬约束（20轮1次/会话2次）');
else bad('热血档：彩蛋频次约束缺失或被改松');
if (hot.includes('每个会话最多触发 1 次')) ok('热血档：暴走态会话限 1 次');
else bad('热血档：暴走态频次约束缺失');

// 5. 本吾档无感叹演出：台词指纹库内不得出现"！"
const solemnLib = solemn.slice(solemn.indexOf('【台词指纹库'));
if (!solemnLib.includes('！')) ok('本吾档：台词指纹库零感叹号');
else bad('本吾档：台词指纹库出现感叹号（本吾档定义即无感叹）');

// 6. 变量引用在两档人设的第 2 行（记忆通道）
for (const [name, text] of [['热血档', hot], ['本吾档', solemn]]) {
  const line2 = text.split('\n')[1] || '';
  if (line2.includes('{{tang_journal}}')) ok(`${name}：第 2 行引用 {{tang_journal}}`);
  else bad(`${name}：{{tang_journal}} 不在第 2 行（记忆注入位置漂移）`);
}

process.exit(failed ? 1 : 0);
