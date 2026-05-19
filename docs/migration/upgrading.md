# Forge 版本升级指南(plugin 形态)

适用:**已经装好 forge plugin / npm CLI** 的项目,从任意 `v1.x` / `v2.x` 升级到更高版本(含跨 major)。

> 还停留在 v0.2 `forge init` legacy 形态(项目里有 `.claude/skills/forge-*/`、`.agents/skills/forge-*/`)的用户,先走 [v0.2-to-v0.3.md](v0.2-to-v0.3.md) 完成形态切换,再回到本文。

## 先理清:`forge upgrade` 命令不是版本升级工具

容易误解 —— `forge upgrade` CLI 子命令**不**升级 plugin/CLI 版本。它只做两件事:

1. 清理 v0.2 `forge init` 时代的 legacy harness adapter 产物(`.claude/skills/forge-*` 等);
2. `--resign-markers` —— 把 v0.4 change marker 一次性升到 v1.0 schema。

已经是 plugin 形态的用户做版本升级**用不到它**。真正的「升级」= 更新 **plugin 本体 / npm 包本体**。

## 升级机制:plugin 自带的 helper 钉死了 CLI 版本范围

forge plugin **不内含** CLI。`scripts/run-forge.mjs` 里有一个 `REQUIRED_RANGE`(如 `^3.0.0`),plugin 每次调 CLI 都是:

```
npx -y --package @accelerator-mzq/forge@<REQUIRED_RANGE> -- forge ...
```

由此得出升级的两条关键规律:

- **跨 major 时,光升 CLI 没用。** 旧 plugin 里的 `REQUIRED_RANGE` 是旧的(v2.0.0 的 plugin → `^2.0.0`)。semver `^2.0.0` = `>=2.0.0 <3.0.0`,永远匹配不到 `3.x`。所以**必须更新 plugin 本体**,让 `run-forge.mjs` 带上新的 `REQUIRED_RANGE`。
- **更新 plugin 后,CLI 通常不用单独管。** helper 会按新的 `REQUIRED_RANGE` 自动 `npx` 拉对应 CLI。只有显式 `npm i -g` 装过全局 CLI 的环境,才需要顺带升一下全局包。

## 按形态升级

### Claude Code plugin(Tier 1,主流路径)

session 内逐条输入:

```
/plugin marketplace update accelerator-mzq-forge
/plugin install forge@accelerator-mzq-forge
/reload-plugins
```

然后 `/exit` + `claude` 重启(SessionStart hook 才会重新注入)。

注意这是**两个独立步骤**:`marketplace update` 只刷新 marketplace 元数据,`install` 才真正覆盖 plugin 本体。第三方 marketplace 默认**不**自动更新,所以每次升级都要手动跑这套。

### npm 全局 CLI

```
npm i -g @accelerator-mzq/forge@latest    # 或钉具体版本 @3.0.0
forge --version                            # 确认输出新版本号
```

### Codex(Tier 3,clone + symlink 形态)

```
cd ~/.codex/forge && git pull              # skills 经 symlink 自动跟随
npm i -g @accelerator-mzq/forge@latest     # Codex 推荐全局 CLI
```

重启 Codex CLI(quit + 重新 `codex`)。

### OpenCode(Tier 2)

`opencode.json` 里以 `forge@git+https://github.com/Accelerator-mzq/forge.git` 形式引入的,重新拉取 git plugin(清掉 OpenCode 的 plugin 缓存后重启 OpenCode)。`file:` 本地 clone 形态则 `git pull` 该 clone。

## 跨 major 升级:BREAKING 必读

升级若跨越一个或多个 major(如 `v1.x` → `v3.0.0`),要把途经的**每个** major 的 BREAKING 都核对一遍。完整、权威列表以 [CHANGELOG.md](../../CHANGELOG.md) 为准;截至 `v3.0.0`:

| 版本     | BREAKING                                                                                          | 应对                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `v2.0.0` | `forge legacy-bridge` 的 map / index / regenerate / sync-check 四命令默认改为 agent 模式           | 依赖旧进程内 SDK 行为的脚本,加 `--api` flag 切回                                                                  |
| `v3.0.0` | archive fence:option=2 的 pause_decision 要求 `added_task_ref` + `capture_id`,并匹配 ack-log 中一条 `forge pause-capture` entry | **进行中的 change**(已 verify/review、未 archive、apply 期没走过 `forge pause-capture`)升级后 archive 会被拒签 —— 见下方「升级安全性」 |

> 维护者注:每发一个新版本,若含 BREAKING,在此表追加一行。

## 升级安全性

- **用户产物不丢**:`forge/` 下的 drafts / changes / specs / config 与 marker 链在 plugin/CLI 版本变化中 **100% 保留**。
- **老 marker 向后兼容**:新版本给 marker 加的字段对旧 marker 取宽松判定(例如 v3.0.0 的 pause-fence,无 `pause_decisions` 字段的早期 marker 天然通过),正常升级**无需** `forge upgrade --resign-markers`。
- **进行中的 change 可能被新 fence 拦**:若升级前有一个 change 已 verify/review、尚未 archive,而新版本恰好加固了 archive fence(如 v3.0.0),该 change 在 archive 阶段可能被拒签。按上表对应 BREAKING 的「应对」处理即可(v3.0.0 的情况:把该 pause_decision 改判为 option=4 Other 并补 `other_rationale` / `other_acked_by`,或人工接受后另行归档)。

## 验证升级成功

```
forge --version                  # npm CLI / Codex:直接看版本号
```

plugin 形态可在 session 内 `/plugin` 查看 forge 的已装版本,或确认任一 `/forge:*` 命令调用时 helper 拉到的 CLI 版本符合预期。

## 故障

升级任一步出问题,贴 transcript 到 <https://github.com/Accelerator-mzq/forge/issues> 报 issue。
