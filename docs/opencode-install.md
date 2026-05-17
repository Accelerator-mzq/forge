# Forge for OpenCode(Tier 2 — PARTIAL_SHIP)

**状态**:Plan 0a.3 实测 PASS(2026-05-09)— `'experimental.chat.messages.transform'` hook 注入 + `config.skills.paths` discovery 全 work;**`/forge:*` slash commands 不可用**(OpenCode plugin 不支持 commands 注册)。

## Prerequisites

- OpenCode CLI(本机已装,`opencode --version` 可用)
- Node 20+
- npm 7+

## Installation Path A — opencode.json plugin 数组(主推)

`~/.config/opencode/opencode.json`(全局)或项目级 `opencode.json` 加 plugin entry:

```json
{
  "plugin": [
    "forge@git+https://github.com/Accelerator-mzq/forge.git"
  ]
}
```

或用 file: 协议指向本地 clone(开发 / air-gapped):

```json
{
  "plugin": [
    "forge@file:/path/to/forge"
  ]
}
```

重启 OpenCode。`config.skills.paths` 自动注入 forge skills 目录,无需手动 symlink。

## Installation Path B — 单文件 symlink fallback

```bash
mkdir -p ~/.config/opencode/plugins
# 单文件 symlink(forge-repo 已 clone)
ln -s /path/to/forge/.opencode/plugins/forge.js ~/.config/opencode/plugins/forge.js
```

重启 OpenCode。注意:Path B 需要源仓库一直可访问(symlink 解引用)。Path A 主推。

## 全局 forge CLI(仅推荐 Path A)

```bash
npm i -g @accelerator-mzq/forge
```

OpenCode 路径下 `/forge:*` slash commands **不可用**,但 forge skills 内嵌 `node "$FORGE_HELPER" validate <id>` 自动跑(skill 文本指示 AI 主动跑 PowerShell/bash,Plan 0a.3 实测 Variant B/C PASS)。`$FORGE_HELPER` 解析:`<plugin_dir>/scripts/run-forge.mjs`,plugin loader 自动可达。

## Verify

```bash
opencode
```

session 内输入:

```
我想做个 todo list 应用
```

预期:AI 通过 OpenCode skill 工具(`→ Skill "brainstorming"`)主动 invoke + 读 SKILL.md + 走 brainstorming 流程(写 `forge/drafts/<date>.md`)。

观察重点(与 Claude Code 不同):
- OpenCode AI 用工具调用形态(Read SKILL.md + Bash 跑命令),不像 Claude Code 直接 `Skill(brainstorming)`
- 协议层 PASS — skill 真被 invoke,流程真走完

## Workflow(适配 Tier 2 PARTIAL_SHIP 路径)

OpenCode 没有 `/forge:*` slash 入口。直接用自然语言驱动,AI 按 skill description auto-trigger:

```
我想做个 todo list             # → Skill(brainstorming) auto
完成 brainstorming 走 propose   # → Skill(writing-plans) auto + 跑 helper validate
跑 apply                       # → Skill(subagent-driven-development) + TDD
review 一下                    # → Skill(requesting-code-review)
完成验证                       # → Skill(verification-before-completion) + 跑 helper validate
完成归档                       # → Skill(finishing-a-development-branch) + 跑 helper archive
```

每个 step AI 主动跑 `node <plugin_dir>/scripts/run-forge.mjs <subcmd>`,helper 内 spawn npx 拉 forge CLI(同 Tier 1 helper 形态)。

## Troubleshooting

### Path A 加载失败 — file: 协议路径错

检查 `opencode.json` plugin entry 路径:

```bash
opencode run --print-logs "hello" 2>&1 | grep -i forge
```

### skill 触发但 helper 调用失败

OpenCode skill 内嵌 `${FORGE_HELPER}` 变量,plugin loader 应解析为 `<plugin_dir>/scripts/run-forge.mjs`。如果失败,fallback 直接 `npx -y --package @accelerator-mzq/forge@^1.4.0 -- forge <subcmd>`(同 Tier 1 行为)。

### Cross-plugin 同名(superpowers + forge brainstorming)

OpenCode plugin 数组同时加两 plugin → 两个同名 skill 都进 discovery。description differentiator 决定 AI 选哪个,不稳定时改用单 plugin(在 opencode.json 暂时移除一个 plugin entry)。

## 升级(v0.2 → v0.3)

v0.2 OpenCode 没有 adapter 实现,无 legacy 产物 — 直接装 v0.3 plugin。

详见 [migration/v0.2-to-v0.3.md](migration/v0.2-to-v0.3.md)。

## Tier 2 ship 限制(推 v0.4)

- `/forge:*` slash commands 不可用(Plan 0a.3 实测 commands 不被 plugin 注册;改用 skill auto-trigger)
- bundled plugin air-gapped 路径未验证(Plan 0a.3 假设 6 UNVERIFIED;air-gapped OpenCode 用户暂无离线方案)
- cross-plugin namespace 共存稳定性未实测(Plan 0a.1.4 假设 4 UNVERIFIED)

这些都推 v0.4 验证。当前 ship 状态:**PARTIAL_SHIP — skills + skill-driven CLI 完整 work,commands 入口降级**。
