# Third-Party Licenses

Forge 包含来自以下开源项目的代码或文本(均为 MIT,允许复制再分发):

## superpowers (https://github.com/obra/superpowers) — MIT

Forge 的 `src/core/templates/skills/` 下 12 个 skill markdown 文本(下表)均改自 superpowers 仓库 `skills/<name>/SKILL.md`,做了 namespace 改名(`superpowers:` → `forge:`)和产物路径改写(`docs/superpowers/specs|plans/` → `forge/drafts|changes/<id>/`)。原文行文、红旗清单、反模式表、流程图保持原样以保留原作者 tuning。

| Forge 文件                          | superpowers 源文件                               |
| ----------------------------------- | ------------------------------------------------ |
| `using-forge.md`                    | `skills/using-superpowers/SKILL.md`              |
| `brainstorming.md`                  | `skills/brainstorming/SKILL.md`                  |
| `writing-plans.md`                  | `skills/writing-plans/SKILL.md`                  |
| `subagent-driven-development.md`    | `skills/subagent-driven-development/SKILL.md`    |
| `test-driven-development.md`        | `skills/test-driven-development/SKILL.md`        |
| `requesting-code-review.md`         | `skills/requesting-code-review/SKILL.md`         |
| `receiving-code-review.md`          | `skills/receiving-code-review/SKILL.md`          |
| `verification-before-completion.md` | `skills/verification-before-completion/SKILL.md` |
| `systematic-debugging.md`           | `skills/systematic-debugging/SKILL.md`           |
| `dispatching-parallel-agents.md`    | `skills/dispatching-parallel-agents/SKILL.md`    |
| `using-git-worktrees.md`            | `skills/using-git-worktrees/SKILL.md`            |
| `finishing-a-development-branch.md` | `skills/finishing-a-development-branch/SKILL.md` |

```
MIT License

Copyright (c) 2025 Jesse Vincent and superpowers contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## OpenSpec (https://github.com/Fission-AI/OpenSpec) — MIT

Forge 的产物结构(proposal/specs/design/tasks)、归档机制、`forge/config.yaml` 配置注入设计借鉴自 OpenSpec。Forge 未直接复制 OpenSpec 代码,仅参考其设计模式,因此本节仅作设计致谢,无具体文件 attribution。
