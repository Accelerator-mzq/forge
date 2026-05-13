# Add OAuth Refresh

## Why

Need refresh token

## What

Implement basic refresh

## Out of Scope {#forge-oos}

```yaml
schema: forge-scope-entries/v1
anchor_id: forge-oos
entries:
  - id: refresh-grace-period
    category: out-of-scope
    description: refresh-token grace period handling
    reason: clock-skew tolerance needs independent spec
    priority: medium
    status: active
    triggered_by: null
    related_change: null
```
