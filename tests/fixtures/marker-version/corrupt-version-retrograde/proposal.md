# Corrupt Version Retrograde Fixture

## Why

test version retrograde detection — created_by_tool_version downgraded from 1.0.0 to 0.4.0

## What

e2e setupFixture 动态 git init + commit 1.0.0 marker + 改 marker 为 0.4.0 + spawn archive → exit 1

## Out of Scope {#forge-oos}

```yaml
schema: forge-scope-entries/v1
anchor_id: forge-oos
entries: []
```
