# Forge legacy-bridge — Brownfield Onboarding 使用手册

> v0.2 新增。已有完整老文档(SRS / HLD / LLD / 测试用例)的项目接入 forge 时使用。

## 概览

`forge legacy-bridge` 三层能力:

| Layer | 命令 | 用途 |
|---|---|---|
| Layer 1 | `forge legacy-bridge sync-check` | 每次 archive 自动跑,检测本次 change 是否需更新老文档 |
| Layer 2 | `forge legacy-bridge index` | one-shot 初始化,为每份老锚点生成 ~100 字摘要 |
| Layer 3a | `forge legacy-bridge regenerate` | one-shot 复写器,LLM 读老锚点 + 代码 → 规范化 SRS/HLD/LLD/system-tests |

老文档**长期保留**,forge 只做**单向同步**(archive → legacy)。反向 sync 推 v0.3。

## 前置:LLM 调用 opt-in(决策 #22 / spec §1.1.1)

v0.2 brownfield 突破 v0.1 §2.3 LLM 边界(在用户路径调 Anthropic API)。需显式 opt-in:

```yaml
# forge/config.yaml
legacy_bridge:
  allow_llm_calls: true       # 必选,默认 false
  enforce_sync: false         # 可选,默认 false(渐进体验)
  auto_resolve_cross_anchor: false  # 可选,默认 false(默认入 diff)
  regen_license: derived-from-source  # 可选,默认 derived-from-source(§9 法律安全)
  provider: anthropic         # v0.2 唯一支持
```

启用步骤:

```bash
# 1. 编辑 forge/config.yaml 加上面段
# 2. 一次性 ack 数据传输到 Anthropic API
forge legacy-bridge --acknowledge-data-transfer

# 3. 若有 contains_customer_data=true 的 anchor,二次确认
forge legacy-bridge --acknowledge-data-transfer --acknowledge-customer-data

# 4. 跑后续命令
forge legacy-bridge regenerate
```

### 合规场景(enterprise / air-gapped / GDPR 要求数据驻留)

保持 `allow_llm_calls: false` 或省略。brownfield 工具拒绝运行,
archive sync-check 自动 graceful skip,forge 主工作流不变。

## 完整工作流

### 双路径执行模型(v1.5 新增,**BREAKING**)

> **BREAKING**:`forge legacy-bridge` 的 map / index / regenerate / sync-check 四命令默认行为已变更:从进程内直接调用 Anthropic SDK → **agent 模式**。升级后首次运行请阅读本节。

#### 默认:agent 模式

四命令(map / index / regenerate / sync-check)默认以 agent 模式运行,分三步:

1. **emit**:命令将 Task manifest 写入 `forge/.cache/legacy-bridge-task-<op>.json`(含操作参数、锚点路径、config 快照),然后挂起等待。
2. **fulfill**:AI agent 读取 manifest,按 `legacy-bridge-fulfillment` skill 执行(LLM 推理、文件读写、结果写回 cache)。
3. **apply**:跑 `forge legacy-bridge <op> --apply`,消费 agent fulfill 写回的结果文件,完成最终落盘。

#### `--api` flag:切回进程内 SDK(CI / 高保证场景)

```bash
forge legacy-bridge map --api
forge legacy-bridge regenerate --api
```

`--api` 保留原 v0.2 行为——进程内直接调 Anthropic SDK,不产生 manifest,不暂停,适合 CI pipeline 或需要确定性输出的场景。

#### `--apply`:消费 agent fulfill 结果

```bash
forge legacy-bridge <op> --apply
```

fulfill 完成后手动触发(或由 agent 自动触发),消费 `forge/.cache/legacy-bridge-task-<op>.json` 中的结果,完成落盘写入。

#### regenerate 两轮流

regenerate 分两轮进行:

- **Round 1**:emit round1 manifest → fulfill → `regenerate --apply`(自动 emit round2 manifest)。
- **Round 2**:fulfill round2 → `regenerate --apply`(最终落盘复写产物)。

两轮之间 agent 可校验 round1 产物后再 fulfill round2,保证保真率。

#### archive 集成(enforce\_sync=true)

当 `enforce_sync=true` 时,`forge archive` 在 preflight 阶段:

1. emit sync-check manifest 并**暂停**(`archive` 进程挂起,exit 0,不继续)。
2. 用户 / agent fulfill sync-check。
3. 跑 `forge archive --resume` 续跑(读取 sync-check 结果,完成后续 archive fence)。

`enforce_sync=false`(默认)时行为不变(post-archive 触发,不阻塞)。

---

### T0:初始化(~30 分钟人工 + ~$10-20 LLM 成本)

```bash
# 1. 二阶段 mapping 第一阶段:LLM 自动扫产 draft
forge legacy-bridge map --overwrite       # 全量重生成
# 或
forge legacy-bridge map                   # --merge 默认,保留用户改动

# 输出:
#   forge/legacy-anchors-draft.yaml
#   forge/legacy-anchors-draft.md(human-readable 概览)

# 2. 用户审改 yaml(改 role 错分类 / 补 unmatched / 删多余)

# 3. 把 draft 改名为正式 anchors.yaml
mv forge/legacy-anchors-draft.yaml forge/legacy-anchors.yaml

# 4. 复写器(one-shot,LLM 读老锚点 → 复写规范化版本)
forge legacy-bridge regenerate
# 输出:
#   forge/docs/regenerated/SRS.md      (含 frontmatter + disclaimer + license)
#   forge/docs/regenerated/HLD.md
#   forge/docs/regenerated/LLD.md
#   forge/docs/regenerated/system-tests.md

# 5. 索引摘要(供 sync-check 性能 + 新 change 提供老文档背景)
forge legacy-bridge index
# 输出:
#   forge/docs/index.md                  (每 anchor 一行 ~100 字摘要)
```

### T1:日常 archive(每次都跑 sync-check 自动)

```bash
# 用户做 change → /forge:apply → /forge:archive
forge archive add-payment

# 自动触发(根据 enforce_sync 配置):
# - enforce_sync=true → archive preflight 跑 sync-check;critical pending → exit 2
# - enforce_sync=false(默认)→ archive 完成后 post-archive 跑 sync-check;不阻塞
```

### T2:resolve 差异项

archive 后看到 `forge/legacy-sync-state/<change-id>.md` 报告:

```bash
# 用户根据报告决定:
# critical 项 #1 真要更新 SRS §4.5 → 用户手动改 docs/legacy/SRS.md §4.5,
#   然后改 forge/legacy-sync-state/<change-id>.yaml 的 #1 status: pending → resolved-by-doc-update
# critical 项 #2 是 LLM 误判 → status: pending → false-positive,reason: "LLM 误读"
# minor 项 #3 不重要 → status: pending → skipped

# 跑 resolve 校验全部 ack
forge legacy-bridge resolve add-payment
```

退出码:
- `0`:全部 ack,sync-state 标 resolved
- `1`:status 字段非法值
- `2`:仍有 pending(列出)

### T3:复写产物的常态生命周期(不再 LLM 重跑)

复写产物归用户维护。手动编辑 `forge/docs/regenerated/SRS.md` 与编辑老文档一样自由。
git commit 跟其他源代码一起进版本控制。

罕见场景:用户彻底重生成 → `forge legacy-bridge regenerate`(等同 T0 重跑,**会覆盖手编辑**;
重跑前请 `git commit` 当前版以便对比 / 还原)。

## 关键 yaml 字段参考

### forge/legacy-anchors.yaml

```yaml
schema: forge-legacy-anchor/v1
anchors:
  - role: requirements          # requirements / high-level-design / low-level-design
                                  # / system-tests / acceptance-report / rationale / glossary
    path: docs/legacy/SRS-v3.2.md
    authoritative: true         # 当前权威版(同 role 仅允 1 个 true)
    version: "3.2"              # 文件版本号(可选,用户填)
    modules: [payment, order]   # 模块边界(用于 sync-check 反查影响)
    sheet: TestCases            # Excel 子 sheet(可选)
    contains_customer_data: false  # §9 GDPR:此文件含客户数据,启用 LLM 时额外 ack
    redact:                     # 此 anchor 专用 redact(决策 #20)
      - regex: "ACME-CUSTOMER-[A-Z][0-9]+"
      - literal: "INTERNAL-DB-PROD-01"
redact:                          # 全局 redact 规则(与每 anchor 的 redact 合并)
  - regex: "我司专用 token 模式"
```

### forge/legacy-sync-state/<change-id>.yaml

```yaml
schema: forge-legacy-sync/v1
change_id: add-payment
generated_at: 2026-05-05T10:30:00Z
diffs:
  - id: 1
    severity: critical
    anchor_path: docs/legacy/SRS.md
    section: §4.5
    description: 支付幂等性约束变化,需更新 SRS
    status: pending             # pending / resolved-by-doc-update / false-positive / skipped
    reason: ""                  # status≠pending 时填(可选)
cross_anchor_conflicts:         # 跨 anchor 不一致(决策 #18 修订:默认入 diff)
  - id: 100
    severity: major
    anchor_path: docs/legacy/SRS.md vs docs/legacy/HLD.md
    description: SRS §4.5 与 HLD §6.2 矛盾
    status: pending
```

## 5 档严重度参考

| 档 | 含义 | 例子 |
|---|---|---|
| 🔴 critical | 合规 / 安全 / 业务硬约束变化 | 支付幂等性 / GDPR / PCI-DSS / 客户验收硬指标 |
| 🟠 major | 行为接口变更 | 新增 endpoint / 字段重命名 / 业务规则改动 |
| 🟡 minor | 文字描述需更新 | 老文档措辞与新代码细微出入 |
| 🔵 style | 格式 / 排版小调整 | 章节顺序变化 / 标点 |
| ⚪ info | 背景信息 | LLM 注意到但无需更新 |

## redact 默认规则参考(决策 #20 / spec §4.5)

| name | 匹配 | 例子 |
|---|---|---|
| aws-access-key | AKIA + 16 字符 | <<aws-example-placeholder>> |
| gcp-api-key | AIza + 35 字符 | AIzaSyDdI0hCZtE6vy... |
| azure-conn-string | DefaultEndpointsProtocol=... | (Azure storage) |
| github-pat | ghp_/gho_/ghu_/ghs_/ghr_ + 36+ 字符 | ghp_aaaaaaa... |
| gitlab-pat | glpat- + 20+ 字符 | glpat-xxxxx |
| slack-token | xox[bpoa]-... | xoxb-1234-... |
| oauth-bearer-basic | Bearer/Basic + 20+ 字符 | Authorization: Bearer xxx |
| jwt | eyJ.eyJ.xxx | eyJhbGciOiJIUzI1NiJ9.... |
| private-key-marker | -----BEGIN ... PRIVATE KEY----- | RSA / EC / OPENSSH 等 |
| db-url-with-creds | postgres/mysql/mongodb/redis://user:pass@host | postgres://app:s3cret@host |
| email | foo@bar.com | (任何邮箱) |
| ipv4-private | 10.x / 192.168.x / 172.16-31.x | 10.0.5.42 |

跑 `--redact-report` flag 验证规则真生效:

```bash
forge legacy-bridge regenerate --redact-report
# 输出:
# [redact] aws-access-key:    3 命中
# [redact] github-pat:         12 命中
# ...
# total: 17 项已 mask 为 <<REDACTED-N>>
```

## FAQ

### Q1:`legacy-anchors.yaml` 与 `forge/config.yaml#legacy_bridge` 的职责怎么分?

| 文件 | 职责 |
|---|---|
| `legacy-anchors.yaml` | anchor metadata:role / path / authoritative / hash / 此 anchor 专用 redact |
| `forge/config.yaml#legacy_bridge` | 全局 policy:allow_llm_calls / enforce_sync / auto_resolve_cross_anchor / regen_license / provider |

(M-5)

### Q2:复写产物可不可以 commit 到 git?

可以。`forge/docs/regenerated/` 整个目录建议 commit。frontmatter 里的 `license: derived-from-source` 是声明,
具体许可由 anchor 源决定(§9)。如果你的项目是 OSS,在 `config.yaml#legacy_bridge.regen_license` 显式覆盖
为 `MIT` / `Apache-2.0` 等。

### Q3:Air-gapped 环境怎么用?

不用 brownfield。保持 `allow_llm_calls: false`,brownfield 命令拒绝运行(graceful exit),
archive 工作流不受影响。手动维护老文档即可。

### Q4:Excel(.xlsx)解析失败怎么办?

如果 Excel 含 chart / pivot / formula,exceljs 解析会报 `unsupportedFeatures`(spec §6.5)。
解决:在 Excel 中"另存为 .csv",改 `legacy-anchors.yaml` 的 path 指向 .csv。

### Q5:复写保真率 < 90% 怎么办?

`forge legacy-bridge regenerate` 失败时不 retry(决策 #16),直接产 `.partial` 报告。三选一:

1. **接受 .partial**:`mv forge/docs/regenerated/SRS.md.partial forge/docs/regenerated/SRS.md`,
   人工补丢失 fact
2. **重写 prompt 重跑**:在 PR 调整 `regenerator.ts` 的 prompt 后重跑
3. **手补**:直接编辑复写产物,补丢失的 critical fact

## 7 个 acceptance scenario(release gate 跑)

每发版必须人工跑(spec §5.1 + Phase F release-gate-checklist 加 §2.4):

| # | 场景 | 验证 |
|---|---|---|
| 1 | opt-in 流程 | `forge legacy-bridge regenerate` 在未 ack 时拒绝运行 + 提示 |
| 2 | redact 真生效 | `--redact-report` 输出 ≥ 9 类规则命中数 |
| 3 | preflight 阻塞 | enforce_sync=true + critical pending → archive exit 2 |
| 4 | lock 并发 | regenerate + archive 同时跑 → 后到者 exit 5 |
| 5 | 多 harness skill smoke | Plan 4 e2e brainstorming acceptance 仍过 |
| 6 | Excel 解析 | 多 sheet xlsx 正确解析 + 中文 sheet 名 |
| 7 | disclaimer 含 license | 复写产物 frontmatter 含 `license: derived-from-source` |

## 退出码(spec §4.6 + §2.1)

| 码 | 含义 |
|---|---|
| 0 | 成功(含 graceful skip) |
| 1 | 一般错误 / 配置错 / 参数无效 |
| 2 | 业务规则失败(critical pending / 保真率不达标) |
| 3 | 复写部分成功(.partial) |
| 4 | 数据损坏(预留) |
| 5 | lock 被另一进程持有 |
