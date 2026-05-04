# spike/claude-code/

**Claude Code 注入机制**:

- `.claude/skills/<skill-name>/SKILL.md` — 会话开始就被加载
- `.claude/commands/<namespace>/<cmd>.md` — slash 命令模板

**测试方法(自动化)**:

```bash
# 在仓库根执行
TMPDIR=$(mktemp -d)
cp -r spike/claude-code/.claude "$TMPDIR/"
cd "$TMPDIR"
claude -p "我想做个 todo list 应用" 2>&1 | tee response.txt
```

判定逻辑(写在 `ACCEPTANCE-TEST.md`):
- AI 输出含"问题 / 澄清 / 范围 / 用户 / 选择"等问询关键词 → PASS
- AI 输出含 `import React` / 完整 jsx 代码块 → FAIL(直接写代码,bootstrap 没生效)
