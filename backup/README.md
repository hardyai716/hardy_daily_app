# 日常集 · 生活工作台 —— 快照备份说明

## 这是什么

`日常集_v14_2026-10-07.html` 与 `life-all-in-one_v14_2026-10-07.html` 是同一个页面的两个路径副本，
内容**完全一致**（md5 均为 `6f42494acd0c4e938ebd256224e005d1`，245233 字节）。
它们与云端 v14 发布版**逐字节相同**，是可直接使用的完整页面。

备份时间：2026-10-07

## 云端资产清单

**页面节点**（个人空间 `pHFugBpWhfhSI7GT5Gssex`）

- 节点 ID：`FxXXoCbSbuuHuowGoydwLH`
- 编辑态：https://www.workbuddy.cn/space/d/FxXXoCbSbuuHuowGoydwLH
- 发布态：https://workbuddy.link/p/FxXXoCbSbuuHuowGoydwLH

**数据表**（6 张，纯数据、无代码）

| 用途 | databaseId | 常量名 |
| --- | --- | --- |
| 记账收支 | `wMPUiJRjq1FFJjDkaRDauJ` | `DB_MONEY` |
| 健身记录 | `yUBsXsNzZ2vj7CuewMBpdQ` | `DB_FITNESS` |
| 书影音 | `B66hZomeHQTqJEWsIYxmCH` | `DB_MEDIA` |
| 习惯打卡 | `6pJ5uqS3eeLVVnDfTh39qB` | `DB_HABIT` |
| 周计划 | `fdubBrDZ1vcncxRNlD4hVr` | `DB_PLAN` |
| 待买清单 | `N0r7pAVJAK35d6XiK2NsP5` | `DB_SHOPPING` |

## 用其他平台继续改这个页面

**核心原则：让新平台"下载云端现有页面 → 在它基础上改 → 传回提交"，绝不要从零重写。**

交给对方的信息：

> 这是我在 WorkBuddy 资料库里的托管页面，节点 ID `FxXXoCbSbuuHuowGoydwLH`。
> 请用资料库能力把它下载下来，在现有文件基础上改 XXX，改完提交新版本并发布。

**动手前先验收**：让对方把下载下来的 HTML 打开看一眼，确认里面能找到
`window.__SMART_PAGE__.database` 和上面 6 个 `DB_*` 常量。
找不到就说明拿错了文件或要重写——**立刻停下**，否则会丢掉数据连接，
页面变成读不出那 936 条账单的空壳。

## 从快照恢复（万一把云端改坏了）

这些备份是**完整可运行的独立页面**，但它们是"离线版"：
数据来自页面内嵌的示例数据，不会连上云端那 6 张表。

恢复步骤：

1. 把 `日常集_v14_2026-10-07.html` 重新上传到资料库节点 `FxXXoCbSbuuHuowGoydwLH`
   的 `index.html` 和 `life-all-in-one.html` 两个路径
2. 提交新版本 → 发布

恢复的是**界面和逻辑**；数据一直在云端 6 张表里，不需要恢复。

## 重要提醒

- 资料库**不支持版本回滚**，改坏了不能用"撤销"找回上一版，所以务必留好快照。
- 每次较大改动前，都建议新增一份带日期的快照，例如 `日常集_v15_2026-10-20.html`。
- 云端是唯一正本；本文件和快照只是保险副本。
