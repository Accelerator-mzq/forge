# 订单系统需求规格说明书 v3.2

## 1. 概述

本系统提供订单管理、支付、退款三大核心功能。

## 2. 数据库约束

### 2.1 Order 表

- user_id 字段非空
- amount 必须 > 0
- status 字段枚举:pending / paid / shipped / refunded

### 2.2 Payment 表

- transaction_id 唯一索引
- 支付时间精确到毫秒(timestamp(3))

## 3. 业务规则

### 3.1 支付幂等

所有支付接口必须使用 Idempotency-Key 头部,服务端用此 key 去重 24 小时。

### 3.2 退款窗口

退款必须在 7 天内发起,超过 7 天系统拒绝。

## 4. 安全约束

### 4.1 PCI-DSS

信用卡号不得存储在数据库,只能存 token(支付网关返回)。

### 4.2 GDPR

用户主动删除账号 30 天内必须从所有 backup 中清除个人数据。
