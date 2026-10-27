// verify-thinking-language.mjs —— 思维链语言规则守门（改编自 whale-loli 同名脚本）。
//
// 为什么需要：这条规则被改软或删掉时不会有任何报错，模型只会悄悄退化成英文思考，
// 没人发现。所以把「位置、措辞、出现次数」全部钉成断言：
//   1. 规则块必须在每个 persona 的前 40 行内（太靠后权重不足）；
//   2. 三条措辞逐字存在（钉死原句，不许改写）；
//   3. 规则块内不许出现软化词（尽量 / 试着 / 最好 / 可以考虑 / 一般来说）；
//   4. 两档 persona 都要有（少一档就有一档失守）。
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

console.log('verify-thinking-language:');

const MUST_HAVE = [
  '【思维链语言 · 强制】',
  '一律使用简体中文',
  '只约束「怎么想」，不约束「怎么答」',
  '这条优先于其他一切语言习惯',
];
const SOFT_WORDS = ['尽量', '试着', '最好', '可以考虑', '一般来说'];

for (const preset of PRESETS) {
  const text = readFileSync(root + preset.personaFile.replace('./', 'src/'), 'utf8');
  const lines = text.split('\n');
  const head = lines.slice(0, 40).join('\n');

  for (const phrase of MUST_HAVE) {
    if (head.includes(phrase)) ok(`${preset.id}：前 40 行含「${phrase}」`);
    else bad(`${preset.id}：前 40 行缺少「${phrase}」`);
  }

  const start = lines.findIndex((l) => l.trim() === '【思维链语言 · 强制】');
  const end = lines.findIndex((l, i) => i > start && l.trim() === '' && lines.slice(0, i).filter((x) => x.trim() === '').length > 2);
  const block = lines.slice(start, end > start ? end : start + 6).join('\n');
  for (const word of SOFT_WORDS) {
    if (!block.includes(word)) ok(`${preset.id}：规则块无软化词「${word}」`);
    else bad(`${preset.id}：规则块出现软化词「${word}」——钉死的规则不许改软`);
  }
}

process.exit(failed ? 1 : 0);
