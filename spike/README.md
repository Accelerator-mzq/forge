# spike/ — 多 harness Bootstrap 注入 PoC

**目的**:验证三 harness 在会话开始就加载 `using-forge` bootstrap,使 `brainstorming` skill 能在用户输入模糊需求时自动触发(不写代码反而开始问问题)。

**退出标准**(写入 `RESULTS.md`):

- 全 3 通过 → v0.1 范围 = Claude Code + Codex + OpenCode
- 仅 Claude + Codex 通过 → v0.1 缩到 2 harness,OpenCode 推 v0.2
- 仅 Claude 通过 → v0.1 缩到 1 harness,Codex+OpenCode 推 v0.2
- 全失败 → 回到设计阶段,重新评估"自动触发"前提

**Acceptance Test**(每个 harness 都跑):

1. 开一个空目录
2. 把 `spike/<harness>/` 下的文件复制/链接到该目录
3. 起新会话,发**这句话**:`我想做个 todo list 应用`
4. **预期**:AI 不直接写代码,而是开始问问题(确认范围/限制/技术栈)
5. **失败**:AI 直接生成代码或 import React 等 → bootstrap 没生效

每个 harness 子目录的 `ACCEPTANCE-TEST.md` 粘贴会话原文 + 判定结果。

不接受 bootstrap 文本变形(比如把"先问问题"改成"先思考问题")绕过测试——必须看到 AI 真在多轮问澄清问题。
