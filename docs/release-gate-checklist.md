# Forge Release Gate Checklist

每发版必须人工跑一遍。任一不通过不发版(spec §5.1)。

## 1. 自动化部分(在 dev 或 release 候选分支上跑)

```bash
pnpm install --frozen-lockfile
node scripts/release-gate.mjs
```

`release-gate.mjs` 会:
- 跑 5 个本地命令(typecheck / lint / format:check / build / vitest)
- `pnpm pack --dry-run` 验证 tarball 内容仅含 `dist/` + 3 个 license/readme 文件
- 创建临时目录,`npm install` tarball,验证 `forge --version` 退出码 0

任一 step 失败 → 报错并退出非 0,不进入手动部分。

## 2. 手动部分:harness acceptance test(spec §5.1)

**v0.1 必须跑两 harness:Claude Code + Codex。任一失败不发版。**

### 2.1 Claude Code

1. 起一个空目录 `mkdir /tmp/forge-release-test-claude && cd $_`
2. `git init`(forge 在非 git 项目下会 warn,在 git 下表现完整)
3. `pnpm dlx @accelerator-mzq/forge init --harness claude`(若发版前,可用本地 tarball 替换:`npm install -g <forge-tarball>` 后跑 `forge init --harness claude`)
4. 起 Claude Code 会话(`claude` 命令)
5. **第一句发**:`我想做个 todo list 应用`
6. **期望(✅ 通过条件,全满足才算 PASS)**:
   - AI 不写代码,反而开始问问题
   - AI 提到至少一个 forge 概念(如 "forge:brainstorming" / "forge/drafts/")
   - 多轮对话完成后,`forge/drafts/<date>-todo-list.md` 文件被创建
7. 把 transcript 复制到 `docs/release-gate-evidence/<version>-claude.md`(供后续 release notes 引用)

### 2.2 Codex

同上,但 step 3 改为 `--harness codex`,step 4 改为起 Codex 会话。

文件路径变为 `.agents/skills/forge-*/SKILL.md`(共享 Claude Agent SDK 约定)而非 `.claude/`。

### 2.4 Brownfield Acceptance(v0.2 新增)

**v0.2 必须跑 7 个 brownfield scenario。任一失败不发版。**

#### 2.4.1 opt-in 流程

1. 起空目录 `mkdir /tmp/forge-bf-1 && cd $_ && git init`
2. `pnpm dlx @accelerator-mzq/forge init --harness claude`
3. 不在 `forge/config.yaml` 加 `legacy_bridge.allow_llm_calls`
4. 跑 `forge legacy-bridge regenerate`
5. **期望(✅)**:exit 1 + 提示 "legacy-bridge 命令需要发送数据到 Anthropic API"

#### 2.4.2 redact 真生效

1. 写 `docs/legacy/secret-srs.md`,含 `<<aws-example-placeholder>>` + `ghp_aaaaaaaa...` + `foo@example.com`
2. 配 anchors.yaml + 启用 LLM(`forge legacy-bridge --acknowledge-data-transfer`)
3. 跑 `forge legacy-bridge regenerate --redact-report --dry-run`
4. **期望(✅)**:stdout 输出 ≥ 3 类规则命中数(aws / github-pat / email)

#### 2.4.3 preflight 阻塞

1. `forge/config.yaml` 加 `legacy_bridge.enforce_sync: true`
2. 制造 1 条 critical pending diff(手编辑 `forge/legacy-sync-state/<id>.yaml`,severity=critical, status=pending)
3. 跑 `forge archive add-payment`(假设有此 change)
4. **期望(✅)**:exit 2,stderr 含 "1 项 critical 差异未 resolve"

#### 2.4.4 lock 并发

1. 终端 A:`forge legacy-bridge regenerate &`(后台)
2. 终端 B 立即:`forge archive add-x`
3. **期望(✅)**:终端 B exit 5,stderr 含 "another forge archive is in progress"
4. 终端 A 跑完后,终端 B 重跑应正常

#### 2.4.5 多 harness skill smoke 不退化

跑 §2.1 + §2.2 的 Claude Code + Codex acceptance test 各一次。
**期望(✅)**:Plan 4 e2e brainstorming 逻辑无变化。

#### 2.4.6 Excel 解析

1. 准备多 sheet `.xlsx`(用 `tests/fixtures/legacy-bridge/_make-excel-fixture.mjs` 生成 fixture)
2. 配 anchors.yaml `path: ./test.xlsx, sheet: TestCases`
3. 跑 `forge legacy-bridge regenerate --role system-tests --dry-run`
4. **期望(✅)**:exit 0,无 ExcelParseError

#### 2.4.7 disclaimer 含 license

1. 跑 `forge legacy-bridge regenerate`(配好 anchors)
2. cat `forge/docs/regenerated/SRS.md`
3. **期望(✅)**:frontmatter 含 `license: derived-from-source` + 顶部 disclaimer 含 "此文档由 forge 自动生成"

#### 失败处理

任一不满足:

- 不发版
- GitHub Issue 标 `release-gate-fail` + `brownfield`
- 检查最近 PR 是否动了 `src/core/legacy-bridge/` 或 `forge-eval/regeneration-*`
- 修复 → 重跑全套 release gate

### 2.3 失败处理

任一 harness 不满足上述期望:
- **不发版**
- 在 GitHub Issues 开 issue,标 `release-gate-fail` label
- 检查最近 PR 是否动了 `src/core/templates/skills/using-forge.md` 或 `forge:brainstorming` 文本
- 修复 → 跑全套 release gate(自动 + 手动)→ 通过后再发版

## 3. 发版动作(checklist 全过后,maintainer 手动)

```bash
# 1. 更新版本号(根据 CHANGELOG.md)
npm version <patch|minor|major> --no-git-tag-version

# 2. 提交 version bump
git add package.json
git commit -m "chore: release v<X.Y.Z>"

# 3. push 并合并到 main(走标准 PR 流程,等 CI 绿)

# 4. 打 git tag
git tag v<X.Y.Z>
git push origin v<X.Y.Z>

# 5. npm publish
npm publish --access public

# 6. 在 GitHub 上 Create release(从 v<X.Y.Z> tag),粘贴 CHANGELOG.md 该版本段
```

## 4. 发版后 sanity check

```bash
# 在干净环境验证全球可装
mkdir /tmp/forge-postrelease && cd $_
npm install -g @accelerator-mzq/forge
forge --version       # 应输出 X.Y.Z
forge init --harness claude
ls .claude/skills/    # 应见 12 个 forge-*/
```

任一不通过 → 立即在 GitHub Issues 开 issue,考虑 unpublish(`npm unpublish` 仅在发版 72 小时内可用)+ patch release。
