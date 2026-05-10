# Baz

### Requirement: Description with multi-line WHEN

Description: 这条规则有详细描述,Description 应该保留(transformer 不删除 Description)。

#### Scenario: continuation

- **WHEN** user submits form
  with remember-me enabled
  and timezone set to UTC
- **THEN** session persists
