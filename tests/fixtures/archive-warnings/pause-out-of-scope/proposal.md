# Pause Out of Scope Fixture

## Why

test pause + scope-entry pair

## What

some change

## Out of Scope {#forge-oos}

```yaml
schema: forge-scope-entries/v1
anchor_id: forge-oos
entries:
  - id: oos-refresh-token
    category: out-of-scope
    description: OAuth refresh token 过期处理
    reason: 本 change 仅含 access token issue/verify;refresh 留 follow-up
    priority: null
    status: active
    triggered_by:
      source: pause_decisions
      id: 1
    related_change: null
```
