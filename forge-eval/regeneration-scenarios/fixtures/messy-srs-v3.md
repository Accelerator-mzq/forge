# 订单系统 SRS v3.2(当前权威版)

## 1. 数据库
- Order 表 user_id **非空**(2025 移除游客下单)

## 2. 支付
- 强制 Idempotency-Key
