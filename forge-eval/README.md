# forge-eval — Skill Eval 框架

自动跑 12 个 forge skill 的 RED/GREEN 双跑 + 双轨打分,产出 `eval-report.md`。详见 [spec §5.5](../docs/specs/2026-05-04-forge-fusion-design.md#55-自动化-skill-eval12-skill-全--multi-turn--weekly--pr)。

## 本地跑

```bash
# 1. 准备 .env
cp forge-eval/.env.example forge-eval/.env
# 编辑填入 ANTHROPIC_API_KEY

# 2. 跑全量(~$6.5,约 5 分钟)
pnpm eval

# 3. 跑单个 skill(调试用)
pnpm eval:skill brainstorming

# 4. 跑 git diff 改动的 skill(模拟 PR 行为)
pnpm eval:changed
```

报告写在仓库根的 `eval-report.md`(已 .gitignore)。

## CI 集成

`.github/workflows/skill-eval.yml` 三种 trigger:

| trigger                                 | 范围             | 何时跑                              |
| --------------------------------------- | ---------------- | ----------------------------------- |
| `pull_request`(paths: skills/scenarios) | `--changed-only` | PR 改 skill 文本 / scenario yaml 时 |
| `schedule`                              | 全量             | 每周日 UTC 8am                      |
| `workflow_dispatch`                     | 全量             | 维护者手动(release 前 / 模型升级时) |

**前置**:仓库 Settings → Secrets → 加 `ANTHROPIC_API_KEY`。在添加之前 workflow 会因无 secret 失败,这是预期。

## 加新 scenario

1. 在 `forge-eval/scenarios/<skill>.yaml` 的 `scenarios` 数组追加 1 项
2. `id` 在该 skill 下唯一
3. `judge_rubric` **必填**,`assertions` 可选
4. 本地跑 `pnpm eval:skill <skill>` 验证

## 已知限制(spec §5.5.9)

SDK 模式不能完全等同于真 harness 多轮工具调用行为。配套用 `tests/cli/e2e-acceptance.test.ts`(env-gated)做真 harness smoke 兜底。
