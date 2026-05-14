# 数据库设计

数据库：MySQL

---

## 表结构

### users 用户表

```sql
CREATE TABLE users (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  openid      VARCHAR(64) NOT NULL UNIQUE COMMENT '微信小程序 openid',
  phone       VARCHAR(20) DEFAULT NULL UNIQUE COMMENT '绑定手机号',
  nickname    VARCHAR(64) DEFAULT NULL COMMENT '用户昵称（头像默认取昵称首字/首字母展示）',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

### records 账单记录表

```sql
CREATE TABLE records (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  type         TINYINT NOT NULL COMMENT '类型：1=收入 2=支出',
  amount       DECIMAL(12, 2) NOT NULL COMMENT '金额（元）',
  category     VARCHAR(32)  DEFAULT NULL COMMENT '分类（餐饮/交通/工资等）',
  note         VARCHAR(256) DEFAULT NULL COMMENT '备注',
  happened_at  DATE NOT NULL COMMENT '账单发生日期',
  input_method TINYINT NOT NULL COMMENT '录入方式：1=手动 2=图片 3=PDF 4=语音',
  parse_status TINYINT NOT NULL DEFAULT 0 COMMENT 'AI解析状态：0=无需解析 1=待解析 2=解析成功 3=解析失败',
  raw_file_url VARCHAR(512) DEFAULT NULL COMMENT '原始文件地址（图片/PDF/音频）',
  raw_text     TEXT DEFAULT NULL COMMENT 'GLM解析的原始返回文本',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_happened (user_id, happened_at),
  INDEX idx_user_created (user_id, created_at)
);
```

---

### sms_codes 短信验证码表

```sql
CREATE TABLE sms_codes (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone      VARCHAR(20) NOT NULL COMMENT '手机号',
  code       VARCHAR(8)  NOT NULL COMMENT '验证码',
  expired_at DATETIME NOT NULL COMMENT '过期时间（5分钟有效）',
  used       TINYINT NOT NULL DEFAULT 0 COMMENT '是否已使用：0=未用 1=已用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_phone (phone)
);
```

---

### plans 订阅套餐表

```sql
CREATE TABLE plans (
  id                     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                   VARCHAR(64)    NOT NULL COMMENT '套餐名称（免费版/Pro版等）',
  price                  DECIMAL(10, 2) NOT NULL COMMENT '价格（元）',
  duration_days          INT            NOT NULL COMMENT '有效天数（30/90/365）',
  max_records_per_month  INT            NOT NULL DEFAULT -1 COMMENT '每月最大记录条数，-1=不限',
  features               JSON           DEFAULT NULL COMMENT '功能权限描述',
  is_active              TINYINT        NOT NULL DEFAULT 1 COMMENT '是否上架：0=下架 1=上架',
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### user_subscriptions 用户订阅表

```sql
CREATE TABLE user_subscriptions (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  plan_id    BIGINT UNSIGNED NOT NULL COMMENT '套餐ID',
  started_at DATETIME NOT NULL COMMENT '订阅开始时间',
  expired_at DATETIME NOT NULL COMMENT '订阅到期时间',
  status     TINYINT  NOT NULL DEFAULT 1 COMMENT '1=有效 2=已过期 3=已取消',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_expired_at (expired_at)
);
```

---

### orders 订单表

```sql
CREATE TABLE orders (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no    VARCHAR(64)    NOT NULL UNIQUE COMMENT '订单号',
  user_id     BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  plan_id     BIGINT UNSIGNED NOT NULL COMMENT '套餐ID',
  amount      DECIMAL(10, 2) NOT NULL COMMENT '实付金额（元）',
  pay_channel TINYINT        NOT NULL COMMENT '支付渠道：1=微信支付 2=支付宝',
  pay_status  TINYINT        NOT NULL DEFAULT 0 COMMENT '0=待支付 1=已支付 2=已退款',
  paid_at     DATETIME       DEFAULT NULL COMMENT '支付时间',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_order_no (order_no)
);
```

---

## 账单分类参考

收入类：`工资` `兼职` `理财` `报销` `其他收入`

支出类：`餐饮` `交通` `购物` `娱乐` `医疗` `住房` `教育` `其他支出`

> 分类由 GLM 解析时自动匹配，手动输入时用户自选。

---

## 查账 SQL 示例

### 月度汇总

```sql
SELECT
  type,
  SUM(amount) AS total
FROM records
WHERE user_id = ?
  AND DATE_FORMAT(happened_at, '%Y-%m') = '2025-01'
GROUP BY type;
```

### 季度明细

```sql
SELECT * FROM records
WHERE user_id = ?
  AND QUARTER(happened_at) = 1
  AND YEAR(happened_at) = 2025
ORDER BY happened_at DESC;
```

### 年度按月趋势

```sql
SELECT
  DATE_FORMAT(happened_at, '%Y-%m') AS month,
  type,
  SUM(amount) AS total
FROM records
WHERE user_id = ?
  AND YEAR(happened_at) = 2025
GROUP BY month, type
ORDER BY month;
```
