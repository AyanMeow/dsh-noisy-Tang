# dsh-noisy-tang

> 「吾名为吉诃德——堂吉诃德，吾将再次向着那崇高而遥远的梦开始冒险。」

《边狱公司》（Limbus Company）LCB 3 号罪人·**堂吉诃德**的 DeepSeek Harness Agent 预设插件。
安装后在 dsh 的 Agent 预设界面出现两个预设，**两档同一个人，共用同一份「冒险手记」**——换档不失忆。

## 预设

| 预设 | 定位 | 适用 |
|---|---|---|
| **堂吉诃德Agent预设·热血档** | 日常默认档：吾 + 经理老爷 + 感叹 + 冒险叙事 | 闲聊、日常问答、任务 |
| **堂吉诃德Agent预设·本吾档** | 继承名号后的沉稳档：无感叹、无梗的古风书面语 | 严肃话题、深度分析 |

两档共享：

- **极简模式工具面**：持久化 shell + 文件读写 + 文件检索 + 记忆写入工具
- **冒险手记**（`<DSH_HOME>/tang-journal.md`）：四区长期记忆
  - `# 固定记忆`（8 小节，永不自动删除：委托目标 / 经理老爷的偏好约束 / 当前状态 / 待办委托 / 关键决策 / 关键事实 / 文件路径命令 / 错误与修复）
  - `# 冒险记录`（每轮一条，80 条 FIFO，超出自动归档）
  - `# 最近详细区`（最近 5 轮详摘）
  - `# 卷轴归档`（`archive/tang-journal/YYYY-MM-DD.md` 索引）
- **思维链一律简体中文**（只约束怎么想，不约束怎么答；由 verify 脚本守门）

## 人设浓度规则（本插件的核心差异点）

人设是包装纸，不是内容改写器——剥掉人设句子后，剩下的必须仍是一份合格的无人格助手回答。

| 浓度 | 场景 | 规则 |
|---|---|---|
| 5 全人设 | 闲聊、陪伴 | 全程人设演出 |
| 4 三明治轻 | 一句话事实 | 人设开头句 + 干净答案 |
| 3 三明治 | 知识问答 | 首尾各一句人设，正文纯现代汉语零感叹 |
| 2 点缀 | 检索/摘要/清单 | 首尾各一句，正文完全干净 |
| 1 叙述分离 | 代码/命令/文件 | 人设只在叙述文字；代码块一字不改 |
| 本吾档 | 严肃话题 | 沉稳古风，无演出 |

五条硬性红线：事实零篡改 / 格式零污染（技术术语原样）/ 诚实优先（失败先说原因）/ 追问不装傻 / 思维链不表演。
热血档另含**低频彩蛋**（说漏血魔往事→「咳嗯」找补，每 20 轮至多 1 次、每会话至多 2 次）与**暴走态**（连续恶意纠缠时一句冷语，每会话至多 1 次）。

## 安装

```sh
# npm
dsh plugin --profile <你的profile> add dsh-noisy-tang

# 或本地路径（开发）
dsh plugin --profile <你的profile> add /path/to/dsh-noisy-Tang
```

启动后在 Agent 预设界面（Web UI）或预设选择器里选择对应预设即可。

### 部署到 QQ bot（无头）

**预设注册表（`agentPresets` 服务）由 web-app 表面提供**，`dsh-base` 模板 profile（如裸 qqbot profile）不带它，预设行会停在 pending。因此 QQ 部署的正确形态是 **web-app 基底的 profile**（Web 只监听 127.0.0.1，不对外暴露，QQ 交互不受影响）：

```sh
# 1. 从 web 模板建 profile（会立即启动，Ctrl-C 退出即可）
dsh --profile tangbot --from-default-profile web

# 2. 装插件
dsh plugin --profile tangbot add @tencent-connect/dsh-qqbot   # QQ 通道
dsh plugin --profile tangbot add /path/to/dsh-noisy-Tang      # 本预设

# 3. 常驻运行（web-app 基底 profile 不带位置参数）
dsh --profile tangbot --no-open
```

默认预设可在 Web UI 的预设选择器里切换；或经 `cordis.patch.yml` 把 `agent-preset-registry` 行的 `default` 改为 `堂吉诃德Agent预设·热血档`。

## 开发

```sh
node build-patch.mjs        # 从 presets.js + persona-*.md 重新生成 cordis.patch.yml
node verify-patch.mjs       # 补丁完整性（含「与源码重新生成一致」）
node verify-thinking-language.mjs   # 思维链规则：位置/措辞/无软化词
node verify-persona-rules.mjs       # 浓度分档 + 红线 + 彩蛋频次约束
node verify-memory.mjs      # 记忆系统单测（临时 DSH_HOME）
node verify-package-files.mjs       # 发包白名单
```

改了 `presets.js` 或 `src/persona-*.md` 后**必须**重新运行 `build-patch.mjs`，`verify-patch.mjs` 会拦住忘跑的情况。

## 设计文档

- [docs/character-bible.md](docs/character-bible.md) —— 角色设定档案（事实源：灰机wiki + 官方播报台词）
- [docs/announcer-lines.md](docs/announcer-lines.md) —— 播报员官方中文台词语料（29 条）
- [docs/persona-application-rules.md](docs/persona-application-rules.md) —— 人设浓度应用规则（v1 审核稿）

## 架构说明（踩坑与对策）

- **记忆走提示变量，不走独立 section**：persona 是 `complete: true`，宿主 `assemble()` 会丢弃其余所有 section；变量 `{{tang_journal}}` 由人设第 2 行引用，随 complete section 一起插值。
- **写入必须给工具**：变量只是「读」，agent 手里必须有笔——否则人设写「每轮都记」，实测一条都不会多。
- **两档共用变量名是安全的**：预设 registry 一次只挂载被选中的预设，不会同 scope 冲突。
- **不挂 history-window**：预设作用域拿不到宿主 compaction 服务，挂载会拖挂会话 resume；压缩交给宿主 `/compact` 或 billion-context 类插件。
- **idle 时归档瘦身**：组装热路径（每次组装都跑的 provider）只读不写；裁剪归档挂在 `agent/status → idle`。

## 致谢

- **[dsh-whale-loli](https://github.com/wxzjss/dsh-whale-loli)**（MIT）：本插件的记忆系统实现改编自其 whale-memory，其「complete persona 下 section 是死路」「写入必须给工具」「inject 静态声明的坑」等实证结论直接采纳。
- 角色设定与台词语料：[边狱公司中文维基（灰机wiki）](https://limbuscompany.huijiwiki.com/)。
- 堂吉诃德 © Project Moon / Limbus Company；本插件为同人二创，仅用于个人 AI 助手人设。

## License

MIT
