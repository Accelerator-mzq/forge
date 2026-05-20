# Proposal: option-3-out-of-scope

## Why

Fixture for plan-9c Task 5: option=3 (转 out-of-scope) fence pass case.

## What

- baseline change

## Out of Scope {#forge-oos}

```yaml
schema: forge-scope-entries/v1
anchor_id: forge-oos
entries:
  - id: refresh-token-expiry
    category: out-of-scope
    description: 'OAuth refresh token 过期处理'
    reason: '非阻塞,subagent 可跳过完成主体 task'
    priority: medium
    status: active
    triggered_by:
      source: pause_decisions
      id: 1
    related_change: null
```
