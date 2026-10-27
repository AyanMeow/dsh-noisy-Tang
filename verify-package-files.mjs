// verify-package-files.mjs —— 发包白名单守门（whale-loli 0.9.16 的事故教训）。
//
// package.json 的 files 白名单决定 npm 包里有什么。白名单指向不存在的路径、
// 或仓库里有该进包的文件没进白名单，都会让发布的包缺文件或带死代码。
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(root + 'package.json', 'utf8'));

console.log('verify-package-files:');
let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.error(`  ✗ ${msg}`);
  failed++;
};

for (const entry of pkg.files) {
  const p = join(root, entry);
  if (existsSync(p)) ok(`files 白名单路径存在：${entry}`);
  else bad(`files 白名单指向不存在的路径：${entry}`);
}

// src/ 下所有文件都应该被打包方式覆盖（src 整目录在白名单里即覆盖）
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const srcFiles = walk(join(root, 'src')).map((p) => p.slice(root.length));
for (const f of srcFiles) {
  if (pkg.files.some((entry) => f.startsWith(entry))) ok(`src 文件被白名单覆盖：${f}`);
  else bad(`src 文件不在白名单覆盖内：${f}`);
}

// 构建脚本与校验脚本不进包（files 里没有它们，正常）
for (const local of ['build-patch.mjs', 'verify-patch.mjs', 'verify-thinking-language.mjs', 'verify-persona-rules.mjs', 'verify-memory.mjs', 'verify-package-files.mjs']) {
  if (!pkg.files.includes(local)) ok(`工具脚本不进包：${local}`);
  else bad(`工具脚本不该进包：${local}`);
}

// 关键字段
if (pkg.dsh?.bundle?.patch === './cordis.patch.yml') ok('dsh.bundle.patch 指向正确');
else bad('dsh.bundle.patch 配置错误');
if (pkg.exports?.['.'] === './src/index.js') ok('exports[.] 指向入口');
else bad('exports 入口配置错误');
if (pkg.peerDependencies?.['@deepseek-ai/cordis']) ok('peerDependencies 含 cordis');
else bad('缺 cordis peer');

process.exit(failed ? 1 : 0);
