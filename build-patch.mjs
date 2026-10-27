// 生成 dsh-noisy-tang/cordis.patch.yml。
//
// 「单一事实来源」：presets.js 出预设清单，人设正文出 src/persona-*.md，
// 本脚本把它们组装成 bundle patch。只为构建方便，不随包发布（但产物提交进仓库，
// 供 `dsh plugin add /本地路径` 直接安装）。
//
// 两档共用同一份冒险手记：tang-journal.md / tang_journal / tang_journal_add。
// 预设独占挂载，同一变量名不会撞 scope。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PRESETS } from './src/presets.js';

const root = fileURLToPath(new URL('.', import.meta.url));

/** 把正文安全地嵌成块标量（位于 `prefix: |-` 之下，缩进 16 空格）。 */
function block(text, spaces = 16) {
  const indent = ' '.repeat(spaces);
  return text
    .replace(/\r\n/g, '\n')
    .trimEnd()
    .split('\n')
    .map((l) => (l.length ? indent + l : ''))
    .join('\n');
}

/**
 * 每个预设共用的工具面行（含记忆行）。
 *
 * 不挂 history-window：预设作用域取不到宿主的 compaction 服务，挂载会拖挂
 * 会话 resume（whale-loli 四次实测的结论，本包直接采纳，不再重试）。
 * 上下文压缩交给宿主 /compact 或 billion-context 类插件。
 */
function toolRows({ memoryFile, memoryVariable, memoryMax, memoryTurns, memoryDetail }) {
  return `          # 长期记忆（冒险手记）：注册成提示变量，由人设开头的 {{${memoryVariable}}} 引用。
          # persona 是 complete:true，宿主会把独立 section 丢掉（见 src/memory.js 顶部注释），
          # 所以记忆必须走 variable 通道。两档预设共用同一变量名——预设独占挂载，不会撞 scope。
          - id: tang-journal
            name: 'dsh-noisy-tang'
            config:
              row: memory
              file: ${memoryFile}
              variableName: ${memoryVariable}
              toolName: ${memoryVariable}_add
              maxChars: ${memoryMax}
              turnLimit: ${memoryTurns}
              detailLimit: ${memoryDetail}
          # ⚠️ 不挂 history-window：预设作用域拿不到 compaction 服务，挂载会拖挂会话 resume。
          # 压缩走宿主 /compact 或 billion-context 类插件；人设里保留「认摘要为依据 + 自己翻原文」。
          - id: agent-instructions
            name: '@deepseek-ai/dsh-agent-instructions'
            config:
              maxBytes: 65536
          # 文件读写：维护 ${memoryFile}、干经理老爷交代的活
          - id: tool-fs
            name: '@deepseek-ai/dsh-tool-fs'
          # 文件检索：找文件、找内容
          - id: tool-fs-search
            name: '@deepseek-ai/dsh-tool-fs-search'
            config:
              sampleOverCapGlobResults: false
          # 持久化 shell（与官方 minimal 一致）
          - id: persistent-shell
            name: cordis:group
            group: true
            isolate:
              terminals: true
            config:
              - id: pty
                name: '@deepseek-ai/dsh-terminal'
              - id: terminal-bash
                name: '@deepseek-ai/dsh-terminal-bash'
                disabled: !!js process.platform === 'win32'
                config:
                  timeoutMs: 300000
              - id: persistent-bash
                name: '@deepseek-ai/dsh-tool-bash-persistent'
                disabled: !!js process.platform === 'win32'
                config:
                  timeoutMs: 300000
              - id: terminal-pwsh
                name: '@deepseek-ai/dsh-terminal-bash'
                disabled: !!js process.platform !== 'win32'
                config:
                  shellDialect: pwsh
                  timeoutMs: 300000
              - id: persistent-pwsh
                name: '@deepseek-ai/dsh-tool-pwsh-persistent'
                disabled: !!js process.platform !== 'win32'
                config:
                  timeoutMs: 300000
`;
}

function presetRow(preset) {
  const persona = readFileSync(root + preset.personaFile.replace('./', 'src/'), 'utf8');
  const memoryVariable = 'tang_journal';
  return `
    # ── 预设：${preset.name} ─────────────────────────────────────
    - id: preset-${preset.id}
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: ${preset.id}
        name: ${preset.name}
        description: ${preset.description}
        order: ${preset.order}
        plugins:
          # 人设：走 dsh-persona 的 prefix；complete:true 剥掉 harness 身份说明
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            config:
              prefix: |-
${block(persona)}
              complete: true
              includeRuntimeContext: false
${toolRows({ memoryFile: 'tang-journal.md', memoryVariable, memoryMax: 16000, memoryTurns: 80, memoryDetail: 5 })}`;
}

const yml = `# dsh-noisy-tang bundle patch — 堂吉诃德 Agent 预设（两档）
#
# 本 bundle 往宿主组合里插两样东西：
#
#   1) 两条 \`@deepseek-ai/dsh-agent-preset\` 声明 —— 每条的 config 就是一个预设本体
#      （id / name / description / order / plugins），被 \`agentPresets.register()\`
#      注册后即出现在 Agent 预设界面。
#   2) 每个预设里一条 \`dsh-noisy-tang\` 记忆行 —— 挂载本包 src/memory.js 的
#      tang-journal，把手记注册成提示变量、并注册写入工具。
#
# 两档共用同一份手记（tang-journal.md）：同一个骑士，换档不失忆。
# 本文件由 build-patch.mjs 生成，不要手改；改 presets.js / persona-*.md 后重新生成。
- insert:
${PRESETS.map(presetRow).join('\n')}
`;

writeFileSync(root + 'cordis.patch.yml', yml, 'utf8');
console.log(`cordis.patch.yml 已生成（${PRESETS.length} 个预设，${yml.length} 字节）`);
