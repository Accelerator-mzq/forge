# Plan 0a 五份 RESULTS 汇总决策

**日期**:2026-05-09
**实施 OS**:Windows 11 + PowerShell 7 + Git Bash

## RESULTS 文件清单(5 份)

| 文件                                                          | 责任 sub-spike                | 状态     |
| ------------------------------------------------------------- | ----------------------------- | -------- |
| `spike/v0.3/0a-claude-code/RESULTS-prelocal.md`               | 0a.1.2 hook 本地预验证        | 完成     |
| `spike/v0.3/0a-claude-code/RESULTS-install-transport.md`      | 0a.1.3 install transport 矩阵 | 完成     |
| `spike/v0.3/0a-claude-code/RESULTS-protocol.md`               | 0a.1.4 plugin 协议            | 完成(假设 4 cross-plugin UNVERIFIED) |
| `spike/v0.3/0a-codex/RESULTS.md`                              | 0a.2.2 Codex 协议             | 完成     |
| `spike/v0.3/0a-opencode/RESULTS.md`                           | 0a.3.2 OpenCode 协议          | 完成     |

## Tier 决策汇总(统一 5 态 + Decision action)

| Tier | Harness     | Status                                    | Decision action       | 实测核心证据                                                                                  |
| ---- | ----------- | ----------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| 1    | Claude Code | PASS                                      | **ENABLE**(release v0.3) | hook + skill auto-trigger + `/test:test` commands 注册 全 PASS;`/reload-plugins` work        |
| 2    | OpenCode    | PARTIAL(skills+transform PASS,commands FAIL) | **PARTIAL_SHIP**       | Path A(opencode.json plugin 数组 + file:)skill 真触发;`/test:test` 报"未识别命令"            |
| 3    | Codex       | PARTIAL(skills PASS,commands FAIL,literal `!command` IGNORED) | **PARTIAL_SHIP**       | `~/.agents/skills/<plugin>` skill 真触发;`/test:test` 报"未识别命令";fenced bash + must-execute AI 主动跑 work |

**Decision action 语义**:
- `ENABLE` — 该 Tier 进 v0.3 ship 范围,全功能
- `PARTIAL_SHIP` — 该 Tier 进 v0.3,但 spec 标记 commands 路径降级到 "skill 内嵌 fenced bash AI 主动跑"形态
- `DEFER` — 不触发(无 Tier 进入此状态)

**v0.3 release 阻塞解除** — 三 harness 全 unblock,无 DEFER 到 v0.4。

## Spec 修订 trigger 列表

实测推翻多处 spec 假设,需修以下章节:

- [ ] **spec §2.2.2**:Codex 路径下"`!command` literal 自动执行"假设删除,改"skill 文本指示 AI 跑 fenced bash + must-execute"(实测 Variant B/C PASS,Variant A IGNORED)
- [ ] **spec §2.4**:commands 重构清单 — Claude Code 路径仍 `node ${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs` 调 helper(`/forge:*` 注册 PASS);OpenCode + Codex 路径 commands 不被 plugin 注册,内容改写到 skill 文本(skill 内嵌 fenced bash + must-execute)
- [ ] **spec §3.5**(critical):OpenCode happy path 数据流 — 删除用户用 `/forge:propose` 等 slash 命令的描述;改 "AI 内化 skill 文本指示 + 主动跑 forge CLI"(同 Codex Tier 3 路径)
- [ ] **spec §1.1 文件树**:OpenCode/Codex 路径下 `commands/` 目录不被 plugin 自动读;保留作为 Claude Code 同源(monorepo 设计),还是 spec 删除 commands/ 在三 harness 共用 — 取决于 Plan 1 决策
- [ ] **spec §7 R3**:更新 Tier 状态描述 — Tier 2/3 实测都是 PARTIAL_SHIP,不是 DEFER;原"Phase 0.5 spike 任一 fail → 退 Claude Code first-class"路径 unblock,实际三 harness 全启用
- [ ] **spec §0 决策 #25**:三 harness manifest — 实测 default export 在 OpenCode 下 work(plan known-issue #1 实证为非问题);保留 default export 是稳妥选择
- [ ] **spec §5.1 末尾"必须验证的协议假设"清单**:更新已实测项

## 5 个未实证假设最终结论(5 态)

| # | 假设                                                              | 结论                                                                                       | spec 修订       |
| - | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------- |
| 1 | OpenCode commands/ 注册 slash                                     | **FAIL** — `/test:test` 报"未识别命令"                                                    | §3.5 + §2.4     |
| 2 | Codex skill 内 `!command` / fenced / 普通文本 3 variant            | A=**IGNORED** / B=**PASS** / C=**PASS**                                                    | §2.2.2 + §3.4   |
| 3 | OpenCode node_modules 加载(npm i -D file:)                       | **UNVERIFIED** — 跳过(air-gapped 是 v0.3 边角,推 v0.4)                                    | §3.5 留 fallback |
| 4 | superpowers + test 同装,description differentiator               | **UNVERIFIED** — 跳过(单 Tier 1 cross-plugin 测试推 v0.4)                                  | §2.6 + §7 R6 留状态 |
| 5 | (config schema,不属 spike,Plan 2 落地)                         | N/A                                                                                        | N/A             |

## Plan 1+ unblock 条件

- ✅ Tier 1 Decision = `ENABLE` → Plan 1+ unblock,继续
- ✅ Tier 2 Decision = `PARTIAL_SHIP` → Plan 1 含 OpenCode plugin manifest(.opencode/plugins/forge.js + opencode.json plugin 数组指引);commands 内容写到 skill 文本
- ✅ Tier 3 Decision = `PARTIAL_SHIP` → Plan 1 含 Codex plugin manifest(.codex-plugin/plugin.json + symlink 装步骤);commands 内容写到 skill 文本

**Plan 1+ 范围调整**:Plan 3 原"commands 重构"任务范围扩大 — 不再仅"裸 forge 调用改 helper",还要把 commands 在 OpenCode/Codex 路径下的内容内化到 skill 文本(预估 +30% Plan 3 工作量)。

## 实测附加发现(非 plan 预期)

1. **Claude Code 本地路径 marketplace**:实测 PASS — 打破 Codex 1 审 P0 推论(superpowers 文档没示范但实际支持)
2. **Codex 子进程不继承 PowerShell USERPROFILE 修改**:Plan known-issue 已加(#12),但 spec 不影响
3. **OpenCode 子进程**继承** `OPENCODE_CONFIG_DIR`**:与 Codex 不同;隔离方案在 OpenCode 下 work
4. **OpenCode default export 完全 work**:plan known-issue #1 实证为非问题(Codex 4 审 P0-1 担心是过虑)
5. **Git Bash on Windows `/tmp/` 与 Node `/tmp/` 路径解释不一致**:Plan 0a.1.2 实测发现并已 patch plan(改 stdin pipe 验证 JSON)

## 下一步

1. 同步 spec 修订(§2.2.2 / §2.4 / §3.5 / §1.1 / §7 R3 / decision #25 / §5.1)
2. commit Plan 0a 全部产物 + spec 修订
3. 转 Plan 0b(forge full plugin fixture spike,Plan 1 产物落地后跑) — 但 Plan 0a 已经验证核心协议假设,Plan 0b 主要是 forge 业务内容替换 throwaway 后再跑一次,应当 PASS
4. 或:跳 Plan 0b 直接转 Plan 1(仓库重构),Plan 0b 在 Plan 1 完成后顺手验
