# Plan 0a.1.3 — Claude Code Install Transport 验证

**日期**:2026-05-09
**Claude Code 版本**:用户实测(Claude Code 2.x 主线)
**OS**:Windows 11 + Git Bash

## Transport 矩阵(统一 5 态)

| Transport                                    | 状态                                                              | 证据 / 错误信息                                                          |
| -------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A. 本地路径 marketplace add                  | **PASS**                                                          | session 输出:`Successfully added marketplace: test-spike` + `✓ Installed test. Run /reload-plugins to apply.` |
| B. `--plugin-dir` CLI 参数                   | UNVERIFIED                                                        | 跳过(A 已 PASS,B 不必跑;若 v0.3 v0.4 文档需要 B 路径再补测)            |
| C. 本地 git URL marketplace add              | UNVERIFIED                                                        | 跳过(同上)                                                              |
| D. 本地 tarball install                      | UNVERIFIED                                                        | 跳过(同上)                                                              |

## 选定的 transport

**Transport A**(本地路径 `/plugin marketplace add <local-path>` + `/plugin install <plugin>@<marketplace>`)

## 决策 hook

- **至少一种 transport SUPPORTED → Plan 0a.1.4 用 Transport A 继续协议验证** ✓ 已 unblock
- 实测命令:
  ```
  /plugin marketplace add D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-claude-code
  /plugin install test@test-spike
  ```

## Spec 影响(打破 Codex 1 审 P0 假设)

Codex 1 审基于 superpowers README 推论"Claude Code 不支持本地路径 marketplace"。**实测推翻此推论**:

- superpowers README 只示范远程 marketplace(`obra/superpowers-marketplace`)
- 但 Claude Code 实际**支持**本地绝对路径作为 marketplace source
- spec §3.3 air-gapped bundled plugin 路径假设(`/plugin install --from-tarball`)仍待验证(Transport D),但 Transport A 已能覆盖 enterprise 内网 git mirror 等场景

**Spec 修订需要**:无(Tier 1 install transport 路径有保障,A 已 PASS)。

## 已知风险参考

Plan 末尾 known-issues #6(INSTALL_BLOCKED 在 transport 表 vs Decision action 表语义矛盾)— 本 RESULTS 取 transport 表语义:**INSTALL_BLOCKED 表示装失败/transport 不支持**(line 1354 表述);若有协议层失败(装上但 hook 不生效),记入 0a.1.4 RESULTS-protocol.md 而非本表。
