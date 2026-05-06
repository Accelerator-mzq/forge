# Redact 测试样本(进 git 版,仅含自补 literal 命中)

> 默认规则(AWS / GCP / GitHub PAT / Slack / JWT 等)的真值命中由 `redact.test.ts` 内字符串拼接构造,不在本 fixture 中。本 fixture 验证"用户自补 literal 多命中 + 默认规则在该 fixture 中 0 命中"。

- 内部业务实体:INTERNAL-DB-PROD-01
- 客户编号:ACME-CUSTOMER-A12
- 项目 codename:Project-FALCON-2026
- 服务别名:internal-srv-payment-prod
- 重复字面量验证:INTERNAL-DB-PROD-01

## 文本中也含正常内容(不应被误 redact)

我们的版本号是 1.2.3,这个段落讨论 §4.5 redact 设计。`forge` 主项目 MIT 协议。
