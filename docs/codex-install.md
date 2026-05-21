# Forge for Codex(Tier 3)

**状态**:Plan 0a.2 实测 PASS(2026-05-09)— `~/.agents/skills/<plugin>` skill auto-trigger + skill 内嵌 fenced bash + must-execute 让 AI 主动跑 helper 全 work;**`/forge:*` slash commands 不注册**(Codex plugin 不支持 commands 注册,完整工作流经 stage skill 桥接路径可达);**literal `!command` 协议 IGNORED**(Plan 0a.2 实测 Variant A 失败,改用 fenced bash Variant B/C)。

## Prerequisites

- Codex CLI(本机已装,`codex --version` 可用)
- Git
- Node 20+
- npm 7+

## Installation

跟 superpowers Codex 安装类似(symlink 形态,实测可行,Plan 0a.2 PASS):

### macOS / Linux

```bash
git clone https://github.com/Accelerator-mzq/forge.git ~/.codex/forge
mkdir -p ~/.agents/skills
ln -s ~/.codex/forge/skills ~/.agents/skills/forge
npm i -g @accelerator-mzq/forge
```

### Windows (PowerShell)

```powershell
git clone https://github.com/Accelerator-mzq/forge.git $env:USERPROFILE\.codex\forge

# 父目录都要先存在(否则 mklink /J fail)
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.codex"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"

cmd /c mklink /J "$env:USERPROFILE\.agents\skills\forge" `
                  "$env:USERPROFILE\.codex\forge\skills"

npm i -g @accelerator-mzq/forge
```

注:`mklink /J` 创建 directory junction(无需 admin / Developer Mode);**不要**用 `mklink` 不带 `/J`(单文件 symlink 需要权限)。

**重启 Codex CLI**(quit + 重新跑 `codex`)— 让 native skill discovery 扫到新 symlink。

## Verify

```bash
codex
```

session 内输入:

```
我想做个 todo list 应用
```

预期:Codex AI 主动说 "我会使用 forge:brainstorming 技能"(精确短语匹配)+ 用 Read 工具读 SKILL.md + Bash 工具跑命令(获时间戳 + echo marker)+ 走 brainstorming 流程。

**观察重点**:Codex 行为模型与 Claude Code 不太一样:
- Claude Code:`● Skill(forge:brainstorming)` 直接调起
- Codex:用 Read + Bash 工具完成 skill 的"阅读 + 执行"
- 两者协议层都 PASS,只是实现机制不同

## Workflow(Tier 3 桥接路径)

Codex 没有 `/forge:*` slash 入口(Plan 0a.2 实测 commands 不可注册)。**完整的 6 步工作流(`brainstorm → propose → apply → review → verify → archive`)通过 stage skill 桥接路径可达**:触发对应 stage skill 后,skill 内的「Tier 2/3 Orchestration」段指示 AI Read 对应 `commands/<stage>.md` 并完整执行其协议 —— 这是 best-effort skill orchestration(不等价于 Claude Code 原生 slash 调用),AI 按协议步骤主动跑 forge CLI。

桥接路径中 plugin root 解析:`~/.codex/forge`(标准安装,把 `~` 展开为绝对路径)。`forge` 可执行 token 替换为 `node "<ROOT>/scripts/run-forge.mjs" <subcmd>`。完整替换规则见 `skills/_shared/tier23-command-bridge.md`。

```
我想做个 todo list             # → Skill(brainstorming) 触发 + Read commands/brainstorm.md + 完整执行
完成 brainstorming 走 propose   # → Skill(writing-plans) 触发 + Read commands/propose.md + 完整执行
跑 apply                       # → Skill(subagent-driven-development) 触发 + Read commands/apply.md + 完整执行
review 一下                    # → Skill(requesting-code-review) 触发 + Read commands/review.md + 完整执行
完成验证                       # → Skill(verification-before-completion) 触发 + Read commands/verify.md + 完整执行
完成归档                       # → Skill(finishing-a-development-branch) 触发 + Read commands/archive.md + 完整执行
```

skill 文本内嵌的 fenced bash 形态(Plan 3 Task 3.3):

````markdown
## CLI validation step

When this skill completes generation, you **MUST** execute:

```bash
node "${FORGE_HELPER}" validate <change-id>
```
````

`$FORGE_HELPER` 解析:`$HOME/.codex/forge/scripts/run-forge.mjs`(`os.homedir()` 跨平台,Windows 走 `USERPROFILE`)。helper 内 spawn `npx -y --package @accelerator-mzq/forge@^4.0.0 -- forge ...` 拉 forge CLI。

## 备选 — 用全局 forge 替代 helper

如果你已 `npm i -g @accelerator-mzq/forge`,helper spawn npx 时会优先找全局 bin(0 延迟)。这是 Codex 推荐路径(skill 文本不变,实测 PASS)。

## Troubleshooting

### skill 触发但不 echo marker / 不跑 helper

Codex skill 内嵌 fenced bash + must-execute 实测 Variant B/C PASS(Plan 0a.2),但**模型可能偶尔跳过自动执行**(behavioral inconsistency,not protocol failure)。

修复:
1. 用更显式的触发短语:"完成验证 + 跑 forge validate"(显式 mention CLI)
2. 或手动跑 `node ~/.codex/forge/scripts/run-forge.mjs validate <id>`(skill 文本指示 + AI 主动跑 PowerShell 是 nice-to-have,不是阻塞流程)

### Codex 不识别 `/forge:*` 命令

预期行为(Plan 0a.2 实测 commands 不支持)。`/forge:*` slash commands 本身不注册,这是事实 —— 完整工作流通过 stage skill 桥接路径(Read `commands/<stage>.md` + 完整执行)可达,不需要 slash 入口。

### Cross-plugin 同名(superpowers + forge brainstorming)

两 plugin 都通过 `~/.agents/skills/` symlink 装,Codex 自动 discovery 两个同名 brainstorming。Codex 不支持 plugin 显式 disable — 两个都启用,由 description differentiator 决定 AI 选哪个。

不稳定时移除一个 symlink:

```bash
rm ~/.agents/skills/superpowers   # 或 forge
```

Plan 0a.1.4 known-issue 推 v0.4 验证 namespace differentiator 是否够稳定。

## 升级(v0.2 → v0.3)

v0.2 codex adapter 写到 `.agents/skills/forge-*` + `.agents/commands/forge/`。`forge upgrade` 命令(Plan 4)自动扫这些路径清理:

```bash
npm i -g @accelerator-mzq/forge
cd <your v0.2 project>
forge upgrade
# y → STASH .agents/skills/forge-* + .agents/commands/forge/* +
#     .claude/skills/forge-*(若同时装 Claude Code)
# forge/ 产物不动
```

详见 [migration/v0.2-to-v0.3.md](migration/v0.2-to-v0.3.md)。

## Tier 3 已知限制

- `/forge:*` slash commands 本身不注册(Codex plugin 不支持 commands 注册) — 完整工作流经 stage skill 桥接路径可达(已有缓解)
- literal `!command` 协议 IGNORED — fenced bash + must-execute 替代(实测 PASS)
- bundled plugin air-gapped 路径不存在(Codex 是 clone + symlink,不需要 bundled)— air-gapped 用户改用本地 git clone + 全局 npm install offline tarball
- Codex 不支持 plugin 显式 disable / enable 控制 — namespace 冲突时只能手动 rm symlink
- Stage extensions(`forge stage-extensions run`)为 Tier 1 Claude Code 专属 — Tier 3 跳过该 hook 段
