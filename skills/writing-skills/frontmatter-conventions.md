# Frontmatter Conventions for forge skills

<!-- 沿 superpowers writing-skills line 95-103 + forge 化(沿 design §2.9.3 步骤 2) -->
<!-- 本文件由 SKILL.md 步骤 2 引用,作为 name / description 规范的展开参考 -->

## name 字段

规则:

- 小写 + 连字符(kebab-case)
- 无 `forge:` 前缀(namespace 由 plugin manifest 隐含;`scripts/copy-templates.mjs:49` reverse-sync 时自动加)
- 与目录名一致(`skills/<name>/SKILL.md` 的 `<name>`)

正例 / 反例对照:

| 类型    | 示例                         | 原因                            |
| ------- | ---------------------------- | ------------------------------- |
| ✅ 正例 | `writing-skills`             | 纯 kebab-case,无前缀            |
| ✅ 正例 | `verifying-three-dimensions` | 同上                            |
| ✅ 正例 | `receiving-code-review`      | 同上                            |
| ❌ 反例 | `forge:writing-skills`       | 冗余前缀;manifest 已隐含        |
| ❌ 反例 | `WritingSkills`              | camelCase 违反 kebab-case 规则  |
| ❌ 反例 | `writing_skills`             | snake_case 违反 kebab-case 规则 |

## description 字段

### 必须符合的格式

1. 第三人称(描述 skill 自身,不是 "我" 或 "你")
2. `"Use when..."` 开头(描述**什么时候触发**)
3. 不超过 500 字(过长会让 skill index 显示不全)
4. **不描述 skill 做什么**(那是 SKILL.md body 的事;process 动词如 `detect` / `guard` / `prevent` / `find` / `check` 作主语即违反规则)

### 触发条件应包含

- 用户场景或意图(`"Use when creating a new forge skill..."`)
- 必要的前提(`"...especially when [specific context]"`)
- 反向触发(`"Skip when [explicit no-trigger condition]"`)— 可选

### 反例(AI 常犯错误)

❌ `"This skill helps you write better skills with proper frontmatter and RED-GREEN-REFACTOR discipline."`

- 描述了"做什么",不是触发条件;无 `"Use when..."`

❌ `"I help users author forge skills using TDD principles."`

- 第一人称;描述"做什么"

❌ `"writing-skills 是用于 RED-GREEN-REFACTOR 协议开发新 forge skill 的方法论 skill。"`

- 描述"做什么";无 `"Use when..."`

❌ `"Use this skill to detect frontmatter violations and guard against invalid descriptions."`

- `detect` / `guard` 是 process 动词作主语;描述的是 skill 行为而非触发条件

### 正例

✅ `"Use when creating or modifying a forge skill — ensures RED-GREEN-REFACTOR discipline + frontmatter conventions + forge-eval integration so new skills actually shape AI behavior in forge contexts"`

- 第三人称;`"Use when..."` 开头;触发条件清晰(创建或修订 forge skill)
- 有目的说明(`"so new skills..."`)让 AI 知道何时不该 invoke

## 不允许在 frontmatter 出现的内容

<!-- YAML 单行 string 限制:frontmatter 里只能放一行描述,以下内容应放 SKILL.md body -->

- ❌ 长 process 描述(应放 SKILL.md body)
- ❌ 多个段落(frontmatter description 必须是单行 string)
- ❌ 列表 / 表格(YAML 单行 string 不支持 markdown 结构)
- ❌ 代码块 / dot graph(frontmatter 不是 markdown body)

## 自检清单

写完 frontmatter 后逐条确认:

- [ ] description 第三人称?
- [ ] description 以 `"Use when..."` 开头?
- [ ] description 描述触发条件而非"做什么"?
- [ ] description 在 500 字内?
- [ ] name 与目录名一致 + kebab-case?
- [ ] name 不含 `forge:` 前缀?
