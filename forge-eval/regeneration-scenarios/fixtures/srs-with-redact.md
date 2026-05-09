# 内部 API SRS

## 1. 数据库连接
生产环境 DB host:INTERNAL-DB-PROD-01(实际连接串通过环境变量注入)

## 2. 内部资源
S3 bucket id:ACME-S3-BUCKET-PROD-A12

## 3. 业务规则
所有写操作必须经过审计日志。
