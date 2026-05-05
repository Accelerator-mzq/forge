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
