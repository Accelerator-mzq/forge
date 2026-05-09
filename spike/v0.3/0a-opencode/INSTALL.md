# Installing test spike plugin for OpenCode

## Prerequisites
- OpenCode CLI(本机已装)

## Installation Path A — opencode.json plugin 数组(superpowers v5 主推)

在 `~/.config/opencode/opencode.json`(或项目级)的 `plugin` 数组加 entry。spike 期用 file: 协议指向本地路径:

```json
{
  "plugin": [
    "forge-spike-test@file:D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-opencode"
  ]
}
```

或用 git URL(若 spike 期把 0a-opencode 做成独立 git repo):
```json
{
  "plugin": [
    "forge-spike-test@git+file:///D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-opencode"
  ]
}
```

重启 OpenCode 即可。

## Installation Path B — 单文件 symlink(superpowers v4 老路径,迁移指南列出)

```bash
mkdir -p ~/.config/opencode/plugins
ln -s D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-opencode/.opencode/plugins/test.js \
      ~/.config/opencode/plugins/test.js
# **注意**:symlink 单文件,不 symlink 目录(superpowers INSTALL.md "Migrating from old symlink-based install" 段明确)
```

## Spike 实测验证

- 假设 1a/1b:`'experimental.chat.messages.transform'` hook 注入 first user message bootstrap(各 Path 独立)
- 假设 2a/2b:`config.skills.paths` 注入 OpenCode skill discovery(各 Path 独立)
- 假设 3:Path A(opencode.json plugin 数组 file:)成功加载
- 假设 4:Path B(单文件 symlink to plugin.js)成功加载
- 假设 5:OpenCode 从 plugin `commands/` 自动注册 `/<plugin>:<cmd>`
- 假设 6:OpenCode 能从项目 node_modules 加载 plugin(npm i -D file: 等价 air-gapped)

详见 Plan 0a.3.2。
