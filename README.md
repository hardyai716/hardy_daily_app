# 日常集 · 生活工作台

一个托管在 WorkBuddy 资料库上的个人数字工作台，集记账、健身、习惯打卡、日程待办、待买清单、书影音于一体。
本仓库用于**版本管理、跨设备同步和回滚**。

## 云端地址

| | |
| --- | --- |
| 编辑态 | https://www.workbuddy.cn/space/d/FxXXoCbSbuuHuowGoydwLH |
| 发布态（手机用） | https://workbuddy.link/p/FxXXoCbSbuuHuowGoydwLH |
| 页面节点 ID | `FxXXoCbSbuuHuowGoydwLH` |
| 所属空间 ID | `pHFugBpWhfhSI7GT5Gssex` |

> 云端是**唯一正本**。本仓库放的是页面快照副本，用于回滚和跨设备搬运。

## 目录说明

```
backup/    页面快照（每个版本一份，可直接上传回云端恢复）
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
6 张云端数据表（纯数据，无逻辑）
```

页内 grep `require(` / `def` / `express` / `@app.route` / `<?php` / `func main` / `CREATE TABLE` 全部为 0。

## 6 张数据表

| 用途 | 常量名 | databaseId |
| --- | --- | --- |
| 记账收支 | `DB_MONEY` | `wMPUiJRjq1FFJjDkaRDauJ` |
| 健身记录 | `DB_FITNESS` | `yUBsXsNzZ2vj7CuewMBpdQ` |
| 书影音 | `DB_MEDIA` | `B66hZomeHQTqJEWsIYxmCH` |
| 习惯打卡 | `DB_HABIT` | `6pJ5uqS3eeLVVnDfTh39qB` |
| 周计划 | `DB_PLAN` | `fdubBrDZ1vcncxRNlD4hVr` |
| 待买清单 | `DB_SHOPPING` | `N0r7pAVJAK35d6XiK2NsP5` |

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

## 在新电脑上用这个项目

```bash
git clone git@github.com:hardyai716/hardy_daily_app.git
cd hardy_daily_app
```

然后把 `backup/` 里最新版本的 HTML 交给 AI（要求它用 WorkBuddy 资料库能力），
让它走标准流程：**开事务 → 上传到节点两个路径 → 提交新版本 → 发布**。

### 改页面的铁律（务必转达给 AI）

1. **必须在现有文件基础上改，绝不要从头重写**——重写会丢掉和 6 张数据表的绑定，
   936 条账单就读不出来了
2. **动手前先验收**：下载到的 HTML 里要能找到 `window.__SMART_PAGE__.database`
   和上面 6 个 `DB_*` 常量；找不到就立刻停下
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

## 安全提醒

- 仓库是**公开还是私有**请自行确认；若是公开仓库，页面代码会对外可见
- `import_work/`（含 2026 年真实账单原始数据）已被 `.gitignore` 排除，不会上传
- 页面代码本身不含真实账目数据；数据存在云端 6 张表里，仓库里没有
