---
description: 调 forge upgrade CLI(清理 legacy v0.2 harness adapter 产物)
argument-hint: '[--dry-run] [--recover] [--gc]'
---

# /forge:upgrade

包装 `forge upgrade` CLI(v0.3 起)。**仅清理 legacy harness adapter 产物;`forge/` 下 drafts/changes/specs/config 100% 不动**。

## 用法

```bash
forge upgrade               # 清理 v0.2 legacy harness adapter 产物
forge upgrade --dry-run     # 只 SHOW DIFF,不 stash
forge upgrade --recover     # 恢复最近 stash(24h 有效期)
forge upgrade --gc          # 删除过期 stash(>24h)
```

## 6 阶段事务

SCAN(纯只读)→ SHOW DIFF(只读)→ ASK(等用户输入)→ STASH(rename 到 `.forge-upgrade-stash-<ts>/`)→ VERIFY(hash 比对)→ COMMIT(默认不删 stash,24h 内可 `--recover`)。

任一阶段失败自动反向 rename 回原位。

## 退出码

- `0`:全部成功 / 无 legacy 产物
- `1`:STASH/VERIFY 失败(已回滚)/ stash 损坏(hash mismatch / 过期)

## v3 → v4 marker 升级路径

v4 BREAKING:**已移除 `--resign-markers` flag**。v0.4 / v1.0 marker → v4 v2 marker 不再有 CLI 自动升级路径;v3 protocol(ack-log / verify_findings / process_evidence / 简码 S/C/L)在 v4 全部消亡。

唯一升级路径(沿 `docs/migration/v3-to-v4.md`):

1. 删除 active change 下的 `.verify-passed` / `.review-passed`(v1 marker)
2. 删 stale 残留:`forge/changes/<id>/.evidence/pending-acks/` + `forge/.cache/archive-pause-<id>.json`
3. 重跑 `/forge:verify` + `/forge:review`(产 v2 marker)
4. 重跑 `/forge:archive`(v4 校验 v2 schema 通过)
