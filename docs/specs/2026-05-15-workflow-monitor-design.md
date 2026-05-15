# Forge 工作流监控观察者(workflow-monitor)设计文档

- **作者**:msc(由 Claude Opus 4.7 协助 brainstorming)
- **日期**:2026-05-15
- **状态**:草案 v6,待用户审阅(经 Codex 四轮对抗性审查 + 一次用户提问修订:v2 修 F-1~F-8,v3 修 G-2~G-10,v4 补 §2.4 启动时机,v5 修 G-9 + Q1~Q5,v6 修 W-1,逐条独立核实,见 §15)
- **目标**:为即将进生产的 forge 工作流提供一套**低耦合、可开关**的旁路监控机制 —— 观察并记录 forge 在每个工作阶段的状态与动作选择,与 OpenSpec / superpowers 在同场景下的走法做对比,在 `/forge:archive`(及任意时刻)生成一份报告,用于评估工作流质量、为后续补充升级提供依据。

---

## 0. 决策快照

| #   | 决策             | 选项                                                                                                  |
| --- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | 监控数据源       | **混合双层** —— CLI 产物观察(可靠骨架)+ AI 行为 trace(补充 fork 点选择)                            |
| 2   | 对比参照源       | **静态差异映射表** —— 从 `OpenSpec/` 与 `superpowers/` 两仓一次性挖出,随上游版本手动维护              |
| 3   | 报告生成时机     | **增量落盘 + 随时可渲染** —— trace 全程追加;archive 渲染完整报告;`forge monitor report` 可随时渲染   |
| 4   | 覆盖范围         | **全量,分层力度** —— 主流程 6 步 + explore = 完整双层 + 三方对比;forge 专属命令 = 仅 CLI 层观察      |
| 5   | 架构             | **低耦合观察者(A′)+ 1 个 `process.on('exit')` 处理器** —— 旁路观察,非承重                          |
| 6   | 开关             | `forge/config.yaml#monitor.enabled`(默认 `false`);由 monitor 模块自行读写,不复用 `forge config set` |
| 7   | 对现有代码的改动 | 仅 2 处:`hooks/session-start` 加条件分支、`src/cli/index.ts` 加 exit 处理器;均由 config 守卫        |
| 8   | 新运行时文件位置 | 新增的 `monitor-check.mjs` 与 AI trace 注入内容文件置于 `hooks/` —— 随 plugin / bundled 自动分发      |

---

## 1. 概述

### 1.1 背景与动机

forge 的阶段性开发已结束,即将投入生产。但 forge 工作流的核心价值是**反向加固协议**(防 AI 在 spec / verify / archive 阶段偷懒),其大部分「决策」由 AI agent 读 SKILL.md / command.md 后做出 —— 这意味着在生产环境中,无法保证 AI 每次都真正执行了加固步骤,而非悄悄退化成「普通 OpenSpec / superpowers」的未加固走法。

需要一套机制:开启后观察记录 forge 每个阶段的状态与动作选择,并与 OpenSpec / superpowers 在同场景下的走法对比,产出报告。报告的核心用途是**回归探测** —— OpenSpec / superpowers 的行为代表「未加固基线」,forge 偏离基线向上是对的,**塌回基线就是缺陷**。

### 1.2 设计原则

1. **低耦合**:forge 工作流对监控系统**零依赖**;监控对 forge 只有**只读依赖**(读 forge 已有产物 + 自有 trace 日志)。监控崩溃绝不影响 forge 运行。
2. **可开关**:由 `forge/config.yaml` 配置决定。**关闭时 —— 零行为、无持久副作用**:不写任何 trace、不注入任何 context。exit 处理器与 SessionStart 助手仍会被调用,但只做一次廉价的同步 config 探测即返回(见 §11、§4 对此措辞的精确说明)。
3. **非承重**:监控是诊断设施,不是工作流的一环。它失败时静默降级,绝不阻塞工作流。
4. **dogfooding**:本功能本身建议用 forge 工作流来实施。

### 1.3 非目标(YAGNI)

- **不做**实时并行跑 OpenSpec / superpowers 三套取真实输出(成本极高、harness 状态不一致)。
- **不做**实时告警推送 —— 报告是阶段性/按需产物,不是 paging 系统。
- **不做** CLI 散埋点 —— CLI 层走产物观察,失败捕获走单一 exit 处理器。
- **不做**跨 change 累积报告(v1 每 change 一份;cross-change 聚合留 v2)。
- **不做**可视化 UI —— markdown 报告足够。
- forge 专属命令(ack-confirm / upgrade / codex-adversarial)只进 CLI 层观察,**不进三方对比表**(它们没有 OpenSpec / superpowers 对应物)。

---

## 2. 架构

### 2.1 耦合面清单

监控系统是一个**旁路观察者**。对 forge **现有代码**的改动仅 2 处,且均由 config 守卫(关闭时只探测、不动作);其余为纯新增文件。

| 改动                                  | 类型   | 说明                                                                                            |
| ------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `hooks/session-start`                 | 改现有 | 加条件分支:调 `hooks/monitor-check.mjs` 判定开关,enabled 才注入 AI trace 指令内容              |
| `src/cli/index.ts`                    | 改现有 | 加 1 个 `process.on('exit')` 处理器:config 守卫下记录 forge CLI 进程退出                       |
| `hooks/monitor-check.mjs`             | 纯新增 | **零依赖** node 助手:读 `config.yaml#monitor.enabled`,供 bash hook 调用;置 `hooks/` 故随 plugin / bundled 自动分发 |
| `hooks/workflow-monitor-injection.md` | 纯新增 | AI trace 指令文本;**非 `skills/` skill**(避开模板 registry 耦合);置 `hooks/` 自动分发         |
| `src/core/monitor/`                   | 纯新增 | 监控核心模块,无人依赖它                                                                        |
| `forge monitor` CLI 子命令            | 纯新增 | 第 16 个子命令(`src/cli/index.ts` 当前已注册 15 个)                                            |
| `config.yaml#monitor`                 | 纯新增 | 新增配置段;读写由 monitor 模块自理,**不复用** `forge config set`(见 §3.1)                     |
| `divergence-map.ts`                   | 纯新增 | 静态差异映射表 —— typed const 数据模块,随 `tsc` 进 `dist/`,零 build 脚本改动(见 §6.1)                                                                                    |

**现有 15 个 CLI 命令文件、10 个 command.md(根 `commands/` 目录;模板 registry 取其 7 个主流程子集)、16 个现有 skill、archive.ts —— 全部 0 改动。** 关闭时,forge 与监控系统互不感知。

### 2.2 数据流

```
forge 工作流跑   ──产出──▶  markers / archive_summary / ack-log / evidence-log  ──┐
                                                                                   │
forge CLI 退出   ──触发──▶  process.on('exit') 处理器  ──▶  cli-exits.jsonl  ──────┤
                                                                                   ├─▶ forge monitor report
AI(被注入内容指示)──调用──▶  forge monitor record  ──▶  trace.jsonl  ────────────┤        │
                                                                                   │        ▼
                            src/core/monitor/divergence-map  ─────────────────────┘   report.md
```

- **CLI 层捕获 = 产物观察 + exit 处理器**:监控读 forge 已落盘的产物(markers 含 hash / finding / ack 状态、`archive_summary.yaml`、ack-log、evidence-log —— 这些 schema 是 forge 的稳定公开接口);exit 处理器补上 forge CLI 进程的 exit code 捕获。
- **AI 层捕获 = `forge monitor record`**:由注入内容指示 AI 在 fork 点调用。
- **对比 = join**:AI 的 `decision` 事件只记录 forge **自己的真实选择** + 对应的 `scenario_id`;OpenSpec / superpowers 那两列由静态映射表提供。AI 不生成对比,只记录 forge 的实际走法 —— 保证对比数据可靠。

### 2.3 为什么是观察者而非内建埋点

| 维度                 | 内建散埋点                              | 观察者(本设计)                                  |
| -------------------- | --------------------------------------- | ------------------------------------------------- |
| 生产风险爆炸半径     | 改 ~15 CLI 文件 + 10 command.md,守卫 bug = 工作流 bug | 改 2 文件;监控崩了 forge 照跑          |
| 对 forge 演进的维护  | 新命令需记得补埋点,否则覆盖率悄悄烂掉  | 只依赖 artifact schema;产标准产物即被免费观察     |
| 开关干净度           | 埋点物理常驻生产代码,只是被守卫        | 关闭 = 仅一次 config 探测,无 trace 写入、无注入   |

观察者的实质缺口是「写不出产物就失败的命令」的 exit code 捕获 —— 由单一 `process.on('exit')` 处理器**大幅缓解**(覆盖 forge CLI 进程的退出;残留盲区诚实列于 §4)。

### 2.4 监控的启动时机与生命周期

监控**不是常驻进程 / 守护,没有「启动」这个动作** —— 它是一组**被动、各自 config 自查**的组件。所谓「启动时机」要按**三个机制**分别理解,它们的生效语义并不相同:

1. **启用(off → on)**:`forge monitor enable` 把 `config.yaml#monitor.enabled` 置 `true`(或用户手改 config)。这是唯一的「开关」动作,本身不拉起任何进程。

2. **三个机制的生效语义(Codex Q1 核实修正)**:

   | 机制                              | 生效时机                                                | 能否回溯 enable 之前                                                                                   |
   | --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
   | **artifact-observer**(CLI 产物读取) | `forge monitor report` / `status` 运行时扫描            | **可回溯全程** —— markers / archive_summary 是 forge 常规产物,与监控开关无关,enable 前已落盘的照样被扫到 |
   | **exit 处理器**(CLI 失败捕获)    | 下一次任意 `forge` CLI 调用(每次进程都注册、自查 config,§4) | **否** —— 只记 enable 之后的 `cli_exit`                                                              |
   | **AI trace**                      | 下一次 SessionStart(会话启动 / clear / compact,§9)    | **否** —— 只有 enable 且会话刷新后的 record                                                            |

3. **推荐用法**:在**新会话里、`/forge:brainstorm` 之前** enable —— 三个机制全部从头覆盖,报告最完整。

**会话中途启用的行为(Codex Q2 核实修正)**:若工作流已跑到中段才 enable,三个维度的覆盖**不对称**:

- **marker 维度**:artifact-observer 回扫整个 change 目录 → 仍能看到 brainstorm/propose/apply 等前段产物,**可回溯全程**。
- **exit code 维度**:`cli-exits.jsonl` 只有 enable 之后的记录,前段缺失。
- **AI trace 维度**:只有下次 SessionStart 之后的 record,前段缺失。

report 渲染器**按维度分别标注覆盖范围**(如「marker:全程 / exit code:verify 起 / AI trace:verify 起」),不笼统说「trace 从中段开始」,也不假装完整。

**关闭(on → off)**:`forge monitor disable` 置 `false`。下一次 CLI 调用 / SessionStart 起 exit 处理器与 AI trace 即静默(§11);artifact-observer 是只读扫描器、不写任何东西,本就无需「关闭」。已落盘的 trace 与 report 保留(用户可手动清 `forge/.monitor/`)。

> `_session` 桶只承载 AI 层 pre-change 事件;CLI 产物层按 change 目录扫描,与 `_session` 无关 —— report 渲染时两者按 change_id 各自归并(§3.2)。

---

## 3. 组件:监控核心模块 `src/core/monitor/`

纯新增模块,建议子文件:

- `types.ts` —— trace 事件、报告、配置的类型定义。
- `config.ts` —— 读 `forge/config.yaml#monitor`,提供 `isMonitorEnabled(projectRoot)`;并提供 `setMonitorEnabled()` 给 `forge monitor enable/disable` 做嵌套写入(见 §3.1)。损坏/缺失在**读**路径一律返回 `false`,绝不抛异常。
- `trace-store.ts` —— append-only JSONL 读写。`appendEvent()` / `readTrace(changeId)`;写入前确保目录存在。
- `artifact-observer.ts` —— 扫描 `forge/changes/<id>/`、`forge/changes/archive/<id>/`,把 markers / archive_summary / ack-log / evidence-log 解析成 CLI 层 trace 事件。
- `divergence-map.ts` —— 静态差异映射表,数据以 typed const 直接写在本 TS 模块(不另存 `.yaml`,见 §6.1 / W-1);提供按 `scenario_id` 查询。
- `report-renderer.ts` —— 合成 markdown 报告。
- `health-verdict.ts` —— 评估 `regression_signal` 与异常,产出健康裁决。

> 配套独立脚本 `hooks/monitor-check.mjs`(置于 `hooks/`、**零依赖**,供 bash hook 调用,见 §9)。

### 3.1 配置 schema 与读写(`forge/config.yaml#monitor`)

```yaml
monitor:
  enabled: false # 默认 false;生产环境默认关
```

`enabled` 为唯一字段。

**关键约束(Codex F-2 核实修正)**:现有 `forge config set <field> <value>` 只做扁平 `config[field] = value`,且 `value` 恒为字符串(`src/cli/commands/config.ts:39`)—— 它**无法**写嵌套键 `monitor.enabled`(会写成顶层键 `"monitor.enabled": "true"`),也不会把 `"true"` 转成 boolean。

因此:

- `forge monitor enable/disable` **不复用** `forge config set`,而是经 `monitor/config.ts#setMonitorEnabled()` 自行 read-modify-write:`parseConfig` 读入 → 置 `config.monitor = { enabled: true|false }` → `stringify` 写回 `config.yaml`。
- `monitor-check.mjs` 与 `isMonitorEnabled()` 读取时,取嵌套 `config.monitor?.enabled === true`。
- `forge config get monitor`(读整段)仍可用于人工查看,不受影响。

**`setMonitorEnabled()` 的边界处理(Codex G-8 核实修正)**:`parseConfig`(`src/core/parse/yaml.ts:40`)在 YAML 损坏或缺 `schema` 字段时抛 `ConfigParseError`。故 `setMonitorEnabled()`:

- `config.yaml` 不存在 → 报错提示「先跑 `forge init`」,**不**自行造 config(monitor 操作本就只在已初始化的 forge 项目里有意义)。
- `config.yaml` 存在但 `parseConfig` 抛 `ConfigParseError` → 明确报错并 abort,**不**静默覆盖一个损坏的 config。
- 正常路径:写回经 `yaml` 的 `stringify`,**保留其它字段的值**;但注释、字段顺序、多行格式不保留 —— 这与现有 `forge config set`(`config.ts:40` 同样 `stringify` 整个对象)行为**一致**,不额外引入劣化(Codex G-6)。

> 兼容性:**读**路径(`isMonitorEnabled` / `monitor-check.mjs`)对 `config.yaml` 缺 `monitor` 段、缺失、损坏一律视为 `enabled: false`,try/catch 兜底,永不抛、永不阻塞。严格报错只在**写**路径(`setMonitorEnabled`)发生。

### 3.2 trace 事件 schema(`trace.jsonl`)

JSON Lines,每行一个事件。公共字段:

```jsonc
{
  "ts": "2026-05-15T12:34:56.789Z", // ISO 8601 UTC
  "schema": "forge-monitor-trace/v1",
  "change_id": "2026-05-15-add-x", // 或 "_session-<uuid>"(change 创建前的事件)
  "stage": "verify", // brainstorm|propose|apply|review|verify|archive|explore|<forge 专属>
  "layer": "cli", // "cli" | "ai"
  "event": "marker_observed", // 见下表
  "data": {
    /* event-specific */
  }
}
```

**CLI 层事件**(由 `artifact-observer` + exit 处理器产出):

| `event`           | `data` 关键字段                                        | 来源              |
| ----------------- | ------------------------------------------------------ | ----------------- |
| `cli_exit`        | `command: string[]`, `cwd`, `exit_code: number`        | exit 处理器       |
| `marker_observed` | `marker_schema`, `path`, `hashes`, `ok`                | artifact-observer |
| `fence_observed`  | `level`, `ok`, `blocked_findings: []`(见下方可得性说明)| artifact-observer |
| `ack_observed`    | `kind: "propose"\|"confirm"`, `finding_id`, `severity`  | artifact-observer |

**AI 层事件**(由 `forge monitor record` 写入):

| `event`          | `data` 关键字段                                       |
| ---------------- | ----------------------------------------------------- |
| `stage_enter`    | `stage`                                               |
| `decision`       | `scenario_id`, `chosen`(forge 实际走的分支), `note?` |
| `hardening_step` | `step`, `executed: boolean`, `evidence?`              |
| `stage_exit`     | `stage`, `outcome`                                    |

> **change_id 关联(Codex F-7 核实修正)**:exit 处理器只可靠知道 `argv` 与 `cwd`。多数 forge 命令把 change-id 作为位置参数(`forge archive <id>`、`forge verify` 等)—— 故关联策略:优先从 `argv` 解析 change-id;无则取 `cwd` 下的活动 change 目录;再无则落 `_session-<uuid>` 桶。**不依赖纯时间窗关联** —— forge 已有 archive lock / staging lock,说明并发写入是真实的(background stage-extensions 也会并发跑),时间窗会误归属。change 创建前(brainstorm / explore)的 AI 层事件落 `_session` 桶,propose 创建 change 后由 report 渲染器并入对应 change。

> **`fence_observed` 可得性(Codex F-6 核实修正)**:`verify` / `review` 的 fence 相关明细来自 verify / review marker 里持久化的 `verify_findings` / `review_outcomes` —— **可直接观察**。但 **archive 三级 fence 的失败裁决无独立持久产物**:archive 失败路径直接 `process.exit(1|2)`、不写 `archive_summary.yaml`;成功的 summary 也只含 process evidence 的 pass/warning/fail/exempt **计数**,非每条 fence 的阻塞明细。因此 `fence_observed` 对 **archive 阶段是推断值** —— 由(verify/review marker 里的未决 finding 作输入)+(archive 命令的 `cli_exit` code)合成,而非从产物直接读出。报告会标明该字段对 archive 阶段是推断而非实测。

---

## 4. exit 处理器(唯一的 CLI 层埋点)

在 `src/cli/index.ts` 注册一个 `process.on('exit')` 处理器,作为观察者架构里**唯一**的 CLI 侧埋点。`process.on('exit')` 会在 forge CLI 进程经 `process.exit(n)`、未捕获异常、或正常跑完退出时触发 —— 覆盖 forge CLI 自身**绝大多数**退出路径,且只此 1 个埋点。

**残留盲区(Codex F-1 核实修正,不夸大)**:

- `process.on('exit')` **不**在 OS 信号(SIGINT / SIGTERM / SIGKILL)或 `process.abort()` 时触发。
- plugin 形态下,slash 命令经 `scripts/run-forge.mjs` spawn 出 npx 子进程跑 forge CLI;exit 处理器注册在**子进程(forge CLI)**里,捕获的是 forge CLI 的退出。`run-forge.mjs` wrapper 自身的失败(npx 找不到 → `child.on('error')` → wrapper `process.exit(127)`)发生在**另一个进程**,**不经**该处理器。
- 这两类盲区可接受:wrapper spawn 失败意味着 forge CLI 根本没跑起来,没有工作流事件可丢;信号 kill 罕见,可由 AI trace 或下一次运行旁证。报告在阶段时间线缺 `cli_exit` 时会标注「该阶段 exit 未捕获」。

行为约束:

1. **config 守卫**:处理器一进来先同步读 `config.yaml#monitor.enabled`,`false`/缺失/损坏 → 立即 `return`(不写文件)。
2. **同步限定**:`'exit'` 处理器内不能调度异步;只用 `fs.mkdirSync` + `fs.appendFileSync`,读 config 也走同步 API。
3. **绝不抛异常**:整个处理器体包在 `try/catch` 里吞掉一切错误 —— `'exit'` 处理器抛异常会污染进程退出。
4. **跳过自身**:`argv` 是 `forge monitor *` 时不记录,避免噪声与潜在递归。
5. **目录自建(Codex G-10 核实修正)**:写入前先 `mkdirSync(forge/.monitor/, { recursive: true })` —— 否则首次运行时目录不存在,`appendFileSync` 抛 ENOENT 被 try/catch 吞掉、静默丢首条记录。
6. **写入目标与路径(Codex G-9 核实修正)**:项目级 `forge/.monitor/cli-exits.jsonl`,路径相对 `process.cwd()` 取 `forge/`。该 cwd = 项目根的约定**对齐 forge CLI 现有 `config` 命令**(`config.ts:19/31` 同样 `join(process.cwd(), 'forge', ...)`);实施时应核对 forge CLI 是否有统一的项目根解析,有则跟随同一策略、不另造一套(不把 `config` 命令的局部约定擅自夸成全 CLI 能力假设)。记录 `{ ts, command: argv, cwd, exit_code }`。

> 该处理器随 forge CLI 注册:plugin 形态下即 `run-forge.mjs` spawn 的子进程 forge CLI;**bundled 形态**下 `run-forge.mjs` 被 build 期 patch 成 `spawn node + dist/cli/index.js`(`build-bundled-plugin.mjs:76-80`),处理器同样在该子进程;**npm CLI 直接调用**形态下即主进程。config 守卫确保 `enabled: false` 时只做一次同步探测即 `return`,无文件写入、无持久副作用。

---

## 5. 存储布局

```
forge/.monitor/
  cli-exits.jsonl              # 项目级:exit 处理器日志(跨所有 change)
  <change-id>/
    trace.jsonl                # 该 change 的 AI 层 + CLI 产物层事件
    report.md                  # 渲染产物
  _session-<uuid>/
    trace.jsonl                # change 创建前的事件桶,propose 后并入对应 change
```

`forge/.monitor/` 整个目录建议加入 `.gitignore`(trace 是诊断产物,不应进版本库)。报告若需留存,用户可手动拷出。

---

## 6. 静态差异映射表(对比的核心)

### 6.1 形态与位置

差异映射表是 **`src/core/monitor/divergence-map.ts`** —— 数据以 typed const 形式直接写在 TS 模块里,**不另存独立 `.yaml` / `.json`**。

**为什么不用独立 asset 文件(Codex W-1 核实修正)**:`build` = `copy-templates.mjs && tsc`。`tsc` 不复制非 TS asset;`copy-templates.mjs` 只同步 skills / shared docs / commands / backlog assets(已核实其尾部),**不覆盖 monitor**。故独立的 `divergence-map.yaml` 不会进 `dist/core/monitor/`,npm CLI 与 bundled 运行时会缺该文件。写成 TS const 则随 `tsc` 自动编入 `dist/`,**零 build 脚本改动**,且 TS 类型即 schema(编译期校验)。

数据从 `OpenSpec/` 与 `superpowers/` 两仓的 commands / skills 一次性挖出,覆盖 7 个可对比阶段(主流程 6 步 + explore),带顶层元数据供报告标注新鲜度。下面用 YAML 写法**示意数据形状**(实际文件是等价的 TS const):

```yaml
meta:
  schema: forge-monitor-divergence-map/v1
  synced_against:
    openspec: <commit 或版本号>
    superpowers: <commit 或版本号>
  synced_at: 2026-05-15
scenarios:
  - stage: verify
    scenario_id: verify-tests-green
    desc: '测试全 pass,要不要继续深挖?'
    openspec: '无强 verify 阶段,验证靠 review,≈ 弱/无对应'
    superpowers: 'verification-before-completion:跑验证命令、确认输出;pass 即可声明完成'
    forge: 'verifying-three-dimensions:测试 pass 只是 Correctness 一维;还需 Completeness + Coherence'
    rationale: '反向加固 —— 防 AI 拿「测试绿」当完工'
    regression_signal: 'verify 阶段 trace 只有 Correctness 维度 record,缺 Completeness/Coherence → forge 塌回 superpowers 基线'
  - stage: archive
    scenario_id: archive-unresolved-warning
    desc: 'review 留了个未解决 WARNING,要不要归档?'
    openspec: 'openspec archive 无 severity 分级 fence → 多半放行'
    superpowers: 'finishing-a-development-branch:给 merge/PR/cleanup 选项,不强制 finding 解决'
    forge: '三级 fence:WARNING 未 resolve 且无 ack → 拒签 exit 1'
    rationale: '反向加固 —— 强 fence 防偷懒归档'
    regression_signal: 'archive 在有未 ack WARNING 时 cli_exit.exit_code=0 → 回归'
```

### 6.2 字段语义

- `scenario_id` —— 唯一 ID,AI 的 `decision` 事件用它引用。
- `openspec` / `superpowers` —— 同场景下两个上游的走法(= 未加固基线)。
- `forge` —— forge 设计意图上的走法(= 加固后)。
- `rationale` —— forge 为何偏离上游。
- `regression_signal` —— **关键字段**:描述「什么样的 trace 模式 = forge 塌回基线」。它把对比从学术对照变成可执行的回归探测器。

### 6.3 维护

映射表是一次性挖掘产物,随上游版本手动维护。报告渲染时,若 `synced_at` 距今过久,在报告里给一句新鲜度提示(不阻塞)。

---

## 7. `forge monitor` CLI 子命令

第 16 个 forge CLI 子命令(`src/cli/index.ts` 当前注册 15 个),commander 注册,与现有子命令平级。

| 子命令                                                              | 行为                                                                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `forge monitor enable`                                              | 经 `setMonitorEnabled()` 自行 read-modify-write,置嵌套 `config.yaml#monitor.enabled = true`(不经 `forge config set`,见 §3.1) |
| `forge monitor disable`                                             | 同上,置 `false`                                                                              |
| `forge monitor status`                                              | 打印当前开关状态 + 活动 change 的 trace 摘要                                                   |
| `forge monitor record --stage <s> --event <e> [--change <id>] [--json '<payload>']` | 追加一条 AI 层事件                                                     |
| `forge monitor report [--change <id>] [--out <path>]`               | 渲染 markdown 报告                                                                            |

**`forge monitor record` 的硬约束**:

- **永远 exit 0**。坏输入(缺参数、JSON 解析失败)只在 trace 里记一条 `event: "record_error"` 的 warning,不报错退出 —— 即使注入内容指令陈旧也绝不破坏工作流。
- `monitor.enabled` 为 `false` 时,**静默 no-op exit 0** —— 即使注入内容残留在上下文里被执行,也零副作用。

**`forge monitor report`**:

- 是独立查询命令,**不在工作流路径上**,可自行 exit 非 0(如 `--change` 指向不存在的 change)。
- 默认渲染到 stdout 并写 `forge/.monitor/<change-id>/report.md`。
- 任意时刻可跑 —— 工作流卡在 verify 时跑它即可拿当前快照(含「中途出问题」场景)。

---

## 8. AI trace 注入内容(非 skill)

AI 层捕获需要给 AI 一段指令文本。**该文本不放在 `skills/` 下**,而是作为 monitor 自有的注入内容文件 **`hooks/workflow-monitor-injection.md`**(路径已冻结 —— Codex G-4)。

**为什么不做成 skill(Codex F-4 核实修正)**:`skills/` 下的 skill 受 `src/core/templates/skills/index.ts` 硬编码 `SKILL_NAMES`(当前 15 项)与 `tests/core/templates/registry.test.ts`(硬断言长度 = 15 且 `toEqual` 全等数组)约束 —— 新增一个 `skills/` skill 必然连带改 registry 与测试,且 legacy `forge init` / template 路径会把它当常规 skill 处理。把 AI trace 指令做成 registry 之外的注入内容文件,**彻底绕开** SKILL_NAMES / `copy-templates.mjs` skill 同步 / registry 测试三处耦合,真正做到「纯新增」。

**为什么放 `hooks/`(Codex G-2 / G-5 核实修正)**:`build-bundled-plugin.mjs:47` **整目录复制** `hooks/`,而 `scripts/` 只单文件复制 `run-forge.mjs`(`:58-59`)。放 `hooks/` 则 bundled 形态与普通 plugin 形态都自动带上该文件,无需改打包清单;SessionStart hook 也能用已算出的 `SCRIPT_DIR` 同级稳定定位。

仅当 `monitor.enabled: true` 时,由 SessionStart hook 把该文件内容追加进注入上下文(见 §9)。它是 AI 层捕获的唯一载体 —— 10 个 command.md、16 个现有 skill 全部不改。

内容要点:

1. 告知 AI:监控已开启,在每个 forge 阶段调 `forge monitor record`。
2. 携带**每阶段 fork 点目录**:每个 stage 下有哪些 `scenario_id` 需要 AI 记录 `decision`,以及哪些 `hardening_step` 需要记录是否 `executed`。
3. 指示:`/forge:archive` 成功后,跑一次 `forge monitor report` 生成完整报告。
4. 指示:工作流中途被 fence 拦下时,跑 `forge monitor report` 拿当前快照报告。
5. **调用形式**:注入内容里所有 `forge monitor ...` 调用,在 plugin 形态须经 `node "${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs" monitor record ...`(与 command.md 一致)—— forge CLI 不在用户 PATH,裸 `forge` 调用会失败。

> AI 层固有不可靠:AI 可能漏记。设计上接受这一点 —— `forge monitor record` 是 exit-0-safe 的,漏记只让报告在该阶段标「AI trace 不完整」,不会破坏工作流。CLI 产物层 + exit 处理器是可靠骨架,AI 层是补充。

> **分发形态限制**:AI trace 注入经 Claude Code 的 SessionStart hook,属 Tier 1 路径。OpenCode / Codex(Tier 2/3)v1 只有 CLI 产物层 + exit 处理器,无 AI trace 层 —— 可接受,留 v2。

---

## 9. SessionStart hook 接线

forge CLI 不在用户 PATH(故有 `run-forge.mjs`);`hooks/session-start` 是 bash 脚本,**当前只解析 `PLUGIN_ROOT`,没有项目根探测、没有 YAML parser**(Codex F-3 核实:不存在可「沿用」的 cwd 探测逻辑)。因此引入一个**零依赖** node 助手:

1. **`hooks/monitor-check.mjs`(纯新增,置于 `hooks/`)**:
   - 放 `hooks/` 而非 `scripts/` —— 见 §8 的 G-2 / G-5 说明(`build-bundled-plugin.mjs` 整目录复制 `hooks/`,只单文件复制 `scripts/run-forge.mjs`)。
   - **零依赖(Codex G-3 核实修正)**:**不** import forge 的 `parseConfig` —— 非 bundled plugin 形态不含 `dist/`(gitignore 的构建产物),`node_modules` 也不随 plugin 分发,故无法依赖编译产物或 `yaml` 包。改为纯 Node 对 `config.yaml` 做针对性最小读取。**scan 契约(Codex Q3 核实修正 —— 须在实施时精确落地)**:
     - 先按行剔除注释 —— 行内第一个非引号包裹的 `#` 起视为注释;
     - 定位**顶层**(零缩进)`monitor:` 键,只在其缩进子块内找 `enabled:`,**不**匹配其它父键下的 `enabled:`;
     - 同时支持块式(`monitor:` 换行缩进 `enabled: true`)与 inline flow 式(`monitor: { enabled: true }`);
     - 值**严格匹配裸 boolean `true`** 才算启用;`false` / 缺失 / 带引号的 `"true"` / 其它任何写法 → disabled;
     - 任何歧义 / 解析不确定 → 默认 disabled(安全侧)。
     config.yaml 由 `forge init` 生成,块式 2 空格缩进是常态,该契约对常态可靠、对罕见手写变体安全降级。这是开关 gate 而非完整 parser,最小实现足够且必要。
   - **路径(Codex G-9 核实修正)**:相对 `process.cwd()` 取 `forge/config.yaml`,与 forge CLI 现有 `config` 命令的 cwd 约定对齐(`config.ts:19/31`);实施时跟随 forge CLI 的统一项目根解析策略(若有),不另造一套。
   - 据结果 `exit 0`(enabled)/ `exit 1`(disabled 或任何异常)。自带 try/catch 兜底。
2. **`hooks/session-start` 加条件分支**:`node "${SCRIPT_DIR}/monitor-check.mjs"`(`SCRIPT_DIR` hook 已算出,`session-start:6`)—— exit 0 才把 `hooks/workflow-monitor-injection.md` 内容追加进 `session_context`;非 0 / 助手缺失 / 调用失败 → 行为与现状完全一致。
3. 任何异常一律当 `disabled`,**绝不阻塞 session 启动**。

> 时机说明:SessionStart 只在会话启动 / clear / compact 时触发。若用户在会话中途 `forge monitor enable`,注入内容要到下一次会话才生效 —— 可接受(正常用法是先 enable 再开始工作流)。

---

## 10. 报告结构(`report.md`)

```
# Forge 工作流监控报告 — <change-id>

生成时间 / divergence-map 新鲜度提示(若过久)

## 1. 健康裁决
   整体:OK / 检出回归 / 检出异常
   - 命中的回归(regression_signal 被触发):逐条列出 scenario + 实际 trace 证据
   - 命中的异常:缺预期 marker / fence 被绕过 / AI trace 与产物矛盾 / 某阶段缺 AI record / 某阶段缺 cli_exit

## 2. 阶段时间线
   逐 stage:进入·退出时间 | CLI 产物事件 | AI trace 事件 | outcome

## 3. 三方对比表(Forge vs OpenSpec vs Superpowers)
   逐 scenario 一行:
   scenario | forge 实际走法(来自 decision.chosen) | openspec 走法 | superpowers 走法 | 加固守住?

## 4. 附录
   原始 trace 摘录 + 产物路径引用
```

### 10.1 健康裁决的判定力度(避免过度承诺)

健康裁决是**尽力而为的自动检测 + 人工复核**的混合:

- **可机检的**自动判 ✓/✗:缺预期 marker、`fence_observed.ok` 与 `cli_exit.exit_code` 矛盾、某阶段完全缺 AI record、`hardening_step.executed=false`。
- **需人工判的**(`regression_signal` 是 prose 描述、语义细微的)→ 报告把「forge 设计意图走法 / 实际 trace / regression_signal 描述」并排呈现,`加固守住?` 列填 `?`,交用户眼判。

v1 不追求 `regression_signal` 全自动机评 —— 那样脆弱且易误报。报告的价值是把对比材料结构化地摆到用户面前。

---

## 11. 错误处理与非侵入保证(硬约束)

| 场景                          | 行为                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `monitor.enabled = false`     | exit 处理器与 SessionStart 助手做一次廉价同步探测后立即 `return` —— 无 trace 写入、无 context 注入(零持久副作用,而非「代码路径不进入」) |
| `config.yaml` 损坏/缺失(读)  | 一律当 `disabled`;`isMonitorEnabled` / `monitor-check.mjs` 永不抛              |
| `config.yaml` 损坏/缺失(写)  | `setMonitorEnabled` 明确报错并 abort(见 §3.1),不静默覆盖                      |
| `forge monitor record` 坏输入 | exit 0,trace 记 `record_error` warning                                        |
| exit 处理器内部出错           | `try/catch` 吞掉;绝不抛(`'exit'` 处理器抛异常会污染退出)                     |
| trace 文件半写 / 损坏行       | JSONL 逐行解析,跳过坏行,报告标注「trace 有损坏行」                            |
| 监控模块任何崩溃              | forge 工作流照常运行 —— 监控是非承重诊断设施                                    |

---

## 12. 测试与 forge-repo 纪律

### 12.1 测试(vitest)

`tests/core/monitor/` 新增单测,覆盖:

- `trace-store` —— 追加、目录自建、逐行解析、坏行跳过。
- `config` —— 读路径 `enabled` 真/假/缺段/损坏 四种输入;`setMonitorEnabled()` 的嵌套 read-modify-write 不破坏其它字段值;config 缺失 / 损坏时写路径正确报错。
- `artifact-observer` —— 各类产物 → CLI 层事件的解析(用 fixture);archive 失败无 summary 时 `fence_observed` 走推断路径。
- `divergence-map` —— `scenario_id` 唯一性、必填字段齐全(数据形状由 TS 类型编译期保证)。
- `report-renderer` + `health-verdict` —— 给定 trace + 映射表 → 报告/裁决快照。
- exit 处理器的 config 守卫(`enabled=false` 时不写文件)、目录自建。
- `monitor-check.mjs` —— enabled / disabled / config 缺失 / 损坏 四种 exit code(零依赖 scan 路径)。

### 12.2 forge-repo 纪律(改代码前必读)

- **monitor 注入内容文件不放 `skills/`**:`skills/` 下的 skill 受 `src/core/templates/skills/index.ts` 硬编码 `SKILL_NAMES`(当前 15 项)与 `tests/core/templates/registry.test.ts`(长度 + `toEqual` 断言)约束 —— 新增 `skills/` skill 必须同步改 registry 与测试。注入内容文件置于 skill registry 之外,绕开此耦合,也不经 `copy-templates.mjs` 的 skill / command 同步。
- **三种分发形态与监控文件的覆盖(Codex Q5 核实修正)**:
  - **npm CLI 包**(`@accelerator-mzq/forge`):`package.json#files` 只发 `dist/`(+ 文档)。CLI 层监控(exit 处理器、artifact-observer、`forge monitor` 子命令)全编进 `dist/` → 随包发布 ✓。`hooks/` **不**随包发布 —— 但 npm CLI 形态本就没有 SessionStart hook 机制,无需 `monitor-check.mjs` / 注入文件;此形态无 AI trace 层,与 §8「AI trace 仅 Tier 1」一致。
  - **普通 plugin**(marketplace / git 仓):`hooks/` 是 committed 文件 → `monitor-check.mjs` + 注入文件随仓分发 ✓;不含 `dist/`(gitignore),CLI 层经 `run-forge.mjs` spawn npx 拉 npm 包。
  - **bundled plugin**:`build-bundled-plugin.mjs:47` 整目录复制 `hooks/` 与 `dist/` → 三个机制全部离线可用 ✓。
  结论:新增运行时文件置于 `hooks/` 后,**两类 plugin 形态自动带上、无需改打包清单**;npm CLI 形态刻意不带 hook 文件(它无 hook 机制),CLI 层仍经 `dist/` 完整可用。
- 本设计**不改** `skills/` 与 `commands/`,故不触发模板双源同步;但 `src/` 下的 monitor 模块、`forge monitor` 子命令照常受 `pnpm build` / lint / typecheck 约束。
- push 前本地至少跑 `pnpm lint` → `pnpm format:check` → `pnpm typecheck` → `pnpm build` → `pnpm test`(CI 同序,任一失败短路)。
- `forge/.monitor/` 加入 `.gitignore`。
- `CHANGELOG.md` 按 Keep a Changelog 记一条 feature。

---

## 13. 实施阶段建议(供 writing-plans 细化)

| 阶段 | 内容                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------- |
| P1   | 监控模块骨架 + `config` schema(含 `setMonitorEnabled` 嵌套写 + 边界处理)+ `trace-store` + `forge monitor record/status/enable/disable` |
| P2   | exit 处理器(`src/cli/index.ts`)+ `artifact-observer`                                                |
| P3   | 差异映射表 —— 挖掘 `OpenSpec/` 与 `superpowers/`,撰写 `divergence-map.ts`(typed const)               |
| P4   | `report-renderer` + `health-verdict` + `forge monitor report`                                         |
| P5   | `hooks/workflow-monitor-injection.md` + `hooks/monitor-check.mjs`(零依赖)+ SessionStart hook 接线     |

各阶段均可独立测试;P1–P2 完成后 CLI 层监控即可用,P3–P5 补齐 AI 层与对比。

---

## 14. 待确认 / 已知限制

- **AI 层固有不可靠**:AI 可能漏调 `forge monitor record`。设计已接受 —— 报告标注不完整,不影响工作流。CLI 产物层 + exit 处理器是可靠骨架。
- **exit 处理器盲区**:不覆盖 OS 信号 kill,也不覆盖 plugin 形态下 `run-forge.mjs` wrapper 层自身的失败(见 §4)。
- **archive fence 失败无独立产物**:archive 失败直接 `process.exit` 不写 summary,`fence_observed` 对 archive 阶段是推断值(见 §3.2)。
- **change_id 关联**:以 `argv` / `cwd` 为主、`_session` 桶兜底(见 §3.2);多终端 + 同 change 并发的极端场景仍可能误归属,v1 接受。
- **config 读改写无并发保护**:`setMonitorEnabled` 与现有 `forge config set` 一致,均无文件锁;`forge monitor enable/disable` 是手动一次性命令、不在工作流回路,并发概率可忽略,v1 接受(Codex G-7)。
- **monitor-check.mjs 用最小 scan 而非完整 YAML parser**:受「非 bundled plugin 不含 `dist/` / `node_modules`」约束所迫(见 §9 G-3);仅用于一个 boolean gate,歧义即默认 disabled,可接受。
- **映射表新鲜度**:`divergence-map.ts` 随上游手动维护;过期时报告给提示,不强制。
- **跨 change 累积**:v1 每 change 一份报告;cross-change 趋势聚合留 v2。
- **AI trace 仅 Tier 1**:AI trace 注入经 SessionStart hook,仅 Claude Code;OpenCode / Codex v1 只有 CLI 层(见 §8)。

---

## 15. 修订记录

### v2(2026-05-15)— Codex 对抗性审查第一轮后修订

Codex 对 v1 提出 8 项 finding,均经独立对照代码核实:

| Finding | 核实 | 修正                                                                                              |
| ------- | ---- | ------------------------------------------------------------------------------------------------- |
| F-1 exit 处理器被过度承诺为「100% 捕获」  | 成立     | §4 改为诚实列出残留盲区(信号 kill、`run-forge.mjs` wrapper 层失败)                              |
| F-2 `forge config set` 撑不起嵌套 `monitor.enabled` | 成立 | §3.1 改为 monitor 模块自行 read-modify-write,不复用 `forge config set`                          |
| F-3 hook「沿用现有 cwd 探测逻辑」不存在    | 成立     | §9 改为引入独立 node 助手做项目根定位 + YAML 读取                                                 |
| F-4 新 skill 非「纯新增」(撞 registry + 测试) | 成立 | §8 改为 AI trace 指令做成 skill registry 之外的注入内容文件                                       |
| F-5 CLI / command / skill 数量基线错      | 部分成立 | CLI 子命令更正为「第 16 个」;command.md「10」/ skill「16」与根源一致,保留并加注                  |
| F-6 artifact-observer 还原不出失败 fence  | 成立     | §3.2 增 `fence_observed` 可得性说明:archive 阶段为推断值                                          |
| F-7 change_id 时间窗关联过于乐观          | 成立     | §3.2 关联策略改为 `argv` / `cwd` 为主、`_session` 兜底;删「forge 工作流串行」错误假设            |
| F-8「关闭时代码路径不进入」自相矛盾       | 成立     | §1.2 / §11 措辞更正为「零行为、无持久副作用」                                                      |

### v3(2026-05-15)— Codex 对抗性审查第二轮后修订

Codex 重审 v2,提出 G-1~G-10;均经独立对照代码核实:

| Finding | 核实     | 修正 / 结论                                                                                   |
| ------- | -------- | --------------------------------------------------------------------------------------------- |
| G-1 `monitor-check.mjs` 不存在            | **不成立** | 误把设计 spec 当实现 —— §2.1 已列「纯新增」、§13 P5 已排期,驳回                              |
| G-2 bundled 打包不含 `monitor-check.mjs`  | 成立     | 新文件改置 `hooks/`(`build-bundled-plugin.mjs:47` 整目录复制 `hooks/`)→ 自动分发              |
| G-3 `monitor-check.mjs` import `parseConfig` 路径不成立 | 成立 | §9 改为**零依赖**:不 import 编译产物,纯 Node 最小 scan(非 bundled plugin 不含 `dist/`)       |
| G-4 注入内容文件路径未冻结                | 成立     | §8 冻结为 `hooks/workflow-monitor-injection.md`                                                |
| G-5 非 skill asset 需显式打包             | 成立     | 同 G-2,置 `hooks/` 一并解决                                                                   |
| G-6 `yaml.stringify` 丢注释 / 字段顺序    | 部分成立 | §3.1 措辞改为「保留字段值,不保留注释 / 格式」,并注明与现有 `forge config set` 行为一致         |
| G-7 config 读改写无并发保护               | 部分成立 | §14 列为已知限制 —— 与现有 `forge config set` 一致,手动一次性命令,接受                        |
| G-8 `parseConfig` schema 必填阻断 enable/disable | 成立 | §3.1 增 `setMonitorEnabled` 边界处理:config 缺失 / 损坏时明确报错 abort                        |
| G-9 exit handler 与 monitor-check 项目根逻辑不一致 | 成立 | §4 / §9 统一为「cwd = 项目根」(与 `config.ts` 约定一致),不做向上查找                          |
| G-10 exit handler 首次 append 目录不存在丢记录 | 成立 | §4 增约束 5:`appendFileSync` 前先 `mkdirSync(..., { recursive: true })`                        |

### v4(2026-05-15)— 应用户提问补充

用户问「监控观察者在什么时机启动」。v3 该信息散落 §3.1 / §4 / §9,且未消歧「会话中途启用」的行为。新增 **§2.4 监控的启动时机与生命周期**,集中说明:监控无常驻进程;CLI 层下次 `forge` 调用即生效、AI trace 层下次 SessionStart 才生效;推荐 brainstorm 前在新会话启用;中途启用则 trace 从中段起、报告如实标注。

### v5(2026-05-15)— Codex 对抗性审查第三轮后修订

Codex 重审 v4:G-2/3/4/5/8/10 确认已修复,G-6/7 确认为可接受的已知限制,G-9 指出措辞过宽,新提 Q1~Q5;均经独立核实:

| Finding | 核实         | 修正 / 结论                                                                                                |
| ------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| G-9 cwd 措辞过宽                         | 成立         | §4 / §9 删「forge CLI 本就不支持从子目录运行」的过宽断言,改为「对齐 `config` 命令的 cwd 约定,实施时跟随 forge CLI 统一项目根解析」 |
| Q1 §2.4 混淆 artifact-observer 与 exit 处理器 | 成立     | §2.4 重写为「三个机制」分别表述,各自生效语义独立(表格化)                                                 |
| Q2 §2.4 漏「中途启用维度不对称」         | 成立         | §2.4 明确 marker 维度可回溯全程、exit code 与 AI trace 维度只覆盖 enable 后,报告按维度标注                  |
| Q3 monitor-check.mjs scan 边界未定义     | 成立         | §9 补 scan 契约(剔注释 / 限顶层 `monitor` 块 / 块式 + inline / 严格裸 `true` / 歧义默认 disabled)          |
| Q4 §2.4/§3/§7 触发点表述不一致           | 成立         | 随 Q1 重写一并消歧;补 `_session` 桶与产物回扫的归并边界                                                    |
| Q5 npm 分发不含 `hooks/` 文件            | 成立(非缺陷) | §12.2 改为三种分发形态显式枚举;npm CLI 形态刻意不带 hook 文件(无 hook 机制),CLI 层经 `dist/` 完整可用    |

### v6(2026-05-15)— Codex 对抗性审查第四轮后修订

Codex 重审 v5:G-9 与 Q1~Q5 确认全部收敛;新提 1 项 W-1,经独立核实成立:

| Finding | 核实 | 修正 |
| ------- | ---- | ---- |
| W-1 `divergence-map.yaml` 作为独立 YAML asset 不会进 `dist/` —— `tsc` 不复制非 TS 文件、`copy-templates.mjs` 只同步 skills/commands/backlog(已核实),npm / bundled 运行时缺失 | 成立 | §2.1 / §3 / §6.1 / §12.1 / §13 改为:差异映射表数据以 typed const 写在 `divergence-map.ts`,随 `tsc` 自动进 `dist/`,零 build 脚本改动,类型即 schema |

Codex 判定:处理 W-1 后文档收敛,可进入实施计划阶段。
