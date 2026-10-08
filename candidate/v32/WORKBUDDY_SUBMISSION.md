# Work Buddy 提交指令：日常集 v32

请按标准事务流程，把本地候选版 v32 提交到私人资料库“日常集”页面。

## 边界

- 源文件：`hardy_daily_app/candidate/v32/index.html`
- 同时覆盖目标中的 `index.html` 和 `life-all-in-one.html`
- 目标页面节点：`FxXXoCbSbuuHuowGoydwLH`
- 保留原有 8 张数据表绑定，任何原表 ID 都不得修改或重建
- 新增 3 张资产数据表，并把创建接口真实返回的表 ID 回填到页面常量
- 只提交到私人资料库，不得公开发布，不得更新公开链接
- 遇到事务冲突、权限错误或建表失败时停止，不得带着空 ID 假装完成

## 新增数据表

三张表都必须包含以下公共字段：

| 字段 | 类型 |
|---|---|
| 稳定ID | text |
| 变更ID | text |
| 完整数据 | text |
| 已删除 | checkbox |

### 1. 资产账户

| 字段 | 类型 |
|---|---|
| 账户名称 | text |
| 账户性质 | text |
| 分类 | text |
| 平台 | text |
| 说明 | text |
| 当前余额 | number |
| 币种 | text |
| 状态 | text |
| 排序 | number |
| 更新时间 | text |

### 2. 资产快照

| 字段 | 类型 |
|---|---|
| 快照时间 | text |
| 总资产 | number |
| 总负债 | number |
| 净资产 | number |
| 生成原因 | text |
| 写入状态 | text |

### 3. 资产快照明细

| 字段 | 类型 |
|---|---|
| 快照ID | text |
| 账户ID | text |
| 账户名称快照 | text |
| 性质快照 | text |
| 分类快照 | text |
| 余额快照 | number |

## 回填位置

创建三张表成功后，将返回的表 ID 分别回填到：

```js
var DB_ASSET_ACCOUNTS = '资产账户表ID';
var DB_ASSET_SNAPSHOTS = '资产快照表ID';
var DB_ASSET_SNAPSHOT_ITEMS = '资产快照明细表ID';
```

不得手写或猜测 ID。三个 ID 必须同时有效；只配置一部分时不要提交。

## 提交与回读

1. 开启事务并读取目标页面当前版本，确认原 8 张表绑定仍在。
2. 创建上述 3 张表，核对字段名称和类型完全一致。
3. 在 v32 内容中回填三个表 ID。
4. 将同一份最终内容同时提交到 `index.html` 和 `life-all-in-one.html`。
5. 回读两个路径。若平台自动注入节点标识导致内容不同，以回读后的 `index.html` 为准重新覆盖两个路径，直到两者内容一致。
6. 核对 `appVersion: 32`、`schemaVersion: 6`。
7. 核对总计 11 张表均已绑定，且原 8 张表 ID 与提交前完全一致。
8. 核对三张新表 ID 非空，三个表结构完整。
9. 核对两个路径最终 SHA-256 一致，并报告字节数和哈希。
10. 结束事务。不要执行公开发布。

资产快照同步协议应保持：先写 `writing` 快照头，再写快照明细和账户，最后把快照头更新为 `complete`。不要改写这段顺序。

## 本地候选校验值

- 未回填资产表 ID 前的候选文件字节数：`375642`
- 未回填资产表 ID 前的 SHA-256：`22cfb6eb692fc2c71504f2a27a3707b9e933d252f603d0d583eaacf7d0ac40df`
- `index.html` 与 `life-all-in-one.html` 当前完全一致
- 本次明确禁止公开发布
