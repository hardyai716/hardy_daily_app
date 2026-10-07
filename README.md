# 日常集 · 生活工作台

一个托管在 WorkBuddy 资料库上的个人数字工作台，集记账、健身、习惯打卡、日程待办、待买清单、书影音于一体。
本仓库用于**版本管理、跨设备同步和回滚**。

**访问约定：只允许本人登录使用，继续由 WorkBuddy 托管和存储数据。**
用户已取消历史公开链接的发布；修改页面后只提交私人资料库版本，不能重新公开发布。

2026-10-07 v18 已上线（云端版本 18，未公开发布）。v15 阶段已完成：权限核验、六表补 40 个字段、
新建「日常集 · 习惯定义」「日常集 · 个人设置」两张表并完成绑定、习惯定义与打卡迁移、双路径对齐。
v17 修复习惯健康页来回卡顿；v18 修复记账页 33 项「幽灵冲突」（写入其实成功，回读校验误判并持久残留）。
最新快照见 `backup/日常集_v18_2026-10-07.html`。

## 云端地址

| | |
| --- | --- |
| 编辑态 | https://www.workbuddy.cn/space/d/FxXXoCbSbuuHuowGoydwLH |
| 历史公开链接（用户已取消发布，待访问验收） | https://workbuddy.link/p/FxXXoCbSbuuHuowGoydwLH |
| 页面节点 ID | `FxXXoCbSbuuHuowGoydwLH` |
| 所属空间 ID | `pHFugBpWhfhSI7GT5Gssex` |

> 云端是**唯一正本**。本仓库放的是页面快照副本，用于回滚和跨设备搬运。

## 目录说明

```
backup/    页面快照（每个版本一份，可直接上传回云端恢复）
candidate/v15/  未部署的双路径候选和校验清单
repair/    定向补丁、隔离回归、表结构准备工具、云端实施说明
.workbuddy/memory/   项目经验记录：版本史、踩坑、编辑铁律
README.md  本文件
```

## 项目形态（重要）

**这个项目没有后端代码。** 它不是「前端 + 后端」结构，而是：

```
单文件 HTML（约 240KB，HTML/CSS/JS 全内联、零外部依赖）
        │ 通过平台内置的读写通道调用
        ▼
window.__SMART_PAGE__.database   ← 平台自带能力，不是自己写的代码
        ▼
8 张云端数据表（6 张原表 + 2 张 v15 新表，纯数据，无逻辑）
```

页内 grep `require(` / `def` / `express` / `@app.route` / `<?php` / `func main` / `CREATE TABLE` 全部为 0。

## 8 张数据表

| 用途 | 常量名 | databaseId |
| --- | --- | --- |
| 记账收支 | `DB_MONEY` | `wMPUiJRjq1FFJjDkaRDauJ` |
| 健身记录 | `DB_FITNESS` | `yUBsXsNzZ2vj7CuewMBpdQ` |
| 书影音 | `DB_MEDIA` | `B66hZomeHQTqJEWsIYxmCH` |
| 习惯打卡 | `DB_HABIT` | `6pJ5uqS3eeLVVnDfTh39qB` |
| 周计划 | `DB_PLAN` | `fdubBrDZ1vcncxRNlD4hVr` |
| 待买清单 | `DB_SHOPPING` | `N0r7pAVJAK35d6XiK2NsP5` |
| 习惯定义（v15 新增） | `DB_HABIT_DEFS` | `Sv1ZU584ikoavvvGj6ZEAn` |
| 个人设置（v15 新增） | `DB_SETTINGS` | `viryd40GCIsjUxkERyI5SG` |

八张表全部为本人 owner 独占，页面处于未发布状态。

## 版本史

- v6 暖色纸感视觉确立
- v7 删除确认弹层 + 触屏常显按钮
- v8 修复云端记录主键用错（`_id`）导致删除/修改从未回写
- v9 习惯打卡数据模型重构（改为 upsert，杜绝重复行）
- v10 日期/时间自绘面板
- v11 修复时间面板点选无反应
- v12 时间选择改为 iPhone 式循环滚轮
- v13 时间面板居中弹出
- v14 滚轮数字列内水平居中
- v15 字段完整性与同步状态重写（补 40 个字段、新增两张表、习惯定义与打卡分离）
- v16 对齐两个页面路径的字节（平台为新插入的同步面板分别生成了节点 ID）
- v17 修复习惯健康页在两屏之间来回卡顿（全量拉取只在首轮执行，写入分批 40 条并连续推进）
- v18 修复记账页 33 项「幽灵冲突」：按内容而非变更标记判定写入结果，全量拉取时清除两端已一致的残留冲突

## 待用户处理的遗留项

- 三张隔离测试表需手动删除（平台没有建表删除接口）：
  `grGFKLqRyVMNXxppHMU5DR`、`FedhYpPDoXM2D1sI5kPiR3`、`xY2IUyNOuBvcrK4np3pzPt`
  （名称均为「[隔离测试] 日常集字段与往返验收」，记录已清空）
- 若原设备上还有内置 5 个之外的新建习惯，需在 v15 页面里补建（定义表可追加）
- 习惯定义表里有一条名为 `test` 的自定义习惯（`a79fc5a0-e2ea-4fe4-a832-4867f1df1ed6`），
  来源无法判定（可能来自原设备），如需清理请在习惯管理页归档/删除

## 在新电脑上用这个项目

```bash
git clone git@github.com:hardyai716/hardy_daily_app.git
cd hardy_daily_app
```

然后把 `backup/` 里最新的 v18 HTML 交给 AI（要求它用 WorkBuddy 资料库能力），
让它走标准流程：**开事务 → 下载事务基线 → 基于当前版本定向修改 → 上传两个路径 → 提交私人资料库版本**。
不得执行公开发布。v15 的字段升级、习惯迁移和两张新表绑定已经完成，禁止重复执行。

### 改页面的铁律（务必转达给 AI）

1. **必须在现有文件基础上改，绝不要从头重写**——重写会丢掉和 8 张数据表的绑定，
   936 条账单就读不出来了
2. **动手前先验收**：下载到的 HTML 里要能找到 `window.__SMART_PAGE__.database`
   和上面 8 个 `DB_*` 常量；找不到就立刻停下
3. **两个路径都要传**：`index.html` 和 `life-all-in-one.html` 必须保持字节一致
4. **保持 CRLF 行尾**：编辑时用 `io.open(..., newline='')`，不要用会转成 LF 的工具；
   本仓库有 `.gitattributes` 锁住行尾，拉取后不会被改动

## 回滚方法

资料库**不支持版本回滚**，所以靠本仓库：

```bash
git log --oneline backup/                    # 看某个快照的提交历史
git show <commit>:backup/日常集_v14_2026-10-07.html > /tmp/restore.html
```

拿到旧版文件后，交给 AI 上传回云端节点即可。

v15 启用后不能直接回滚到 v14：旧版不认识删除标记和独立习惯定义。
需先导出最新数据、清理或转换旧版可见的数据形态，再在测试环境验证；页面回滚不能代替数据恢复。

## 安全提醒

- 仓库是**公开还是私有**请自行确认；若是公开仓库，页面代码会对外可见
- `import_work/`（含 2026 年真实账单原始数据）已被 `.gitignore` 排除，不会上传
- `private_work/` 用于权限结果、真实表导出、迁移映射和事务文件，也已排除；不能放入 Git
- 页面代码本身不含真实账目数据；数据存在云端 8 张表里，仓库里没有
