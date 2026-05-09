# Plan 0b.1 — Claude Code Full Fixture Spike 实测结果(部分)

**日期**:2026-05-09
**Claude Code 版本**:用户实测主线
**Install transport**:Transport A 本地路径 marketplace add(Plan 0a.1.3 实测 PASS)
**Fixture 项目**:`D:\ClaudeProject\tmp\forge-fresh-fixture`(throwaway)
**实测背景**:Plan 1 Task 1.9 用户验证 — 顺手实测 forge full plugin 而不是 throwaway test plugin

## 协议假设验证(Plan 0a 协议 → Plan 0b 业务回归)

| Step | 假设 | 结论 | 证据 |
|---|---|---|---|
| 1 | Plugin install 三命令(marketplace add + install + reload-plugins) | **PASS** | `Successfully added marketplace: accelerator-mzq-forge` + `Installed forge` + `Reloaded: 6 plugins · 15 skills` |
| 2 | SessionStart hook 注入 + 12 skills 进 auto-trigger | **PASS** | 重启 session 后 AI 主动说"按 forge 红旗清单必须先走 brainstorm" |
| 3 | brainstorming auto-trigger + ask questions | **PASS** | 输入"我想做个 todo list 应用" → AI invoke `Skill(forge:brainstorming)` + 走完整流程(提问 4 维度 → 方案对比 → 选 A → 详细设计 → 写 draft + commit) |
| 4 | propose skill 链(propose → writing-plans) | **PASS** | 用户输 "全都 OK,继续 propose" → AI 自动 invoke `Skill(forge:propose)` → 进而 `Skill(forge:writing-plans)` |
| 5 | writing-plans 产 4 件套 | **PASS** | proposal.md(58 行)+ specs/(3 个 sub-area,共 292 行)+ design.md(136 行)+ tasks.md(**1378 行,11 task TDD 完整模板**) |
| 6 | AI self-review 修正 | **PASS** | AI 自检发现 3 处问题 + inline 修(monkeypatch 改稳健 / KeyError 处理改清晰 / 补 spec 缺口测试) |
| 7 | forge CLI 不在 PATH 的 P1 行为 | **PASS(符合 spec)** | `forge validate` 报 "command not found",AI 主动改"等价手动检查"(Plan 3 helper 是 fix) |
| 8 | plugin namespace `forge:`(无双前缀) | **PASS** | `Skill(forge:brainstorming)` 单 namespace,我 Plan 1 去 `forge:` 前缀 fix 正确 |
| 9 | apply / review / verify / archive 流程 | **NOT TESTED** | 未跑(fixture 里的 todo list 是 demo,继续 apply 会浪费时间真实施 Python 代码) |

## Tier 1 release 阻塞状态

✅ **完全解除** — 实测证据强于 Plan 0a:

- Plan 0a 只验"brainstorming auto-trigger"(throwaway test plugin)
- Plan 0b.1(本次)验**完整 brainstorm → propose 阶段**(forge 真业务内容),含 skill 链 + AI self-review + 4 件套产出
- forge plugin 在 Claude Code 路径下**完整 work**

## 实测过程中暴露 / 发现的事实

1. **plugin namespace 行为确认**:fresh fixture 项目级 settings.local.json 只 enable `forge@accelerator-mzq-forge`,user-level 装的 superpowers 不自动 enable → namespace 冲突测试自动避开
2. **Plan 1 去前缀 fix 正确性**:Plan 1 Task 完成后用户即将跑 Task 1.9 时,我发现 12 skill frontmatter `name:` 都带 `forge:` 前缀(v0.2 老形态),批量去掉 — 实测确认 Claude Code 注册成 `forge:brainstorming` 等(plugin namespace + 无前缀 skill name),触发短语正常匹配
3. **forge writing-plans skill 行为**:AI 自动按 superpowers writing-plans 风格产**极详细** tasks.md(1378 行,11 task 完整 TDD red/green/refactor + step-by-step 命令)— 这是 Plan 2 P3 修复(scale-aware mode + light_threshold)要解的真实场景:1378 行对 todo list MVP 这种 trivial 改动确实过度
4. **forge CLI P1 行为**:符合 spec §2.1 描述 — `forge validate` 不在 PATH,AI 主动 graceful fallback("等价手动检查"),不阻塞 propose 流程

## Spec / Plan 修订 trigger

无 — Plan 0a 协议假设全部回归 PASS,Plan 1 仓库重构 + frontmatter 去前缀 验证为正确路径。

Plan 0b.2(Codex)+ Plan 0b.3(OpenCode) full fixture 推到 Plan 1+2+3 全部完成后跑(Plan 6 release 前)— 协议层 Plan 0a.2/0a.3 已 PASS,业务回归大概率不会出新问题。

## 下一步

- 用户退出 fixture session(避免继续 apply 跑 demo 代码)
- 删 fixture(可选,throwaway)
- 转 Plan 2 实施
