# 生活工作台项目长期约定（MEMORY.md）

页面：日常集 · 生活工作台（资料库节点 FxXXoCbSbuuHuowGoydwLH）
- 编辑态：https://www.workbuddy.cn/space/d/FxXXoCbSbuuHuowGoydwLH
- 发布态：https://workbuddy.link/p/FxXXoCbSbuuHuowGoydwLH（用户手机上用的是这个）
- 产物：index.html 与 life-all-in-one.html **字节相同**（同一页面两路径），改一个必须同步改另一个。
- 版本史：v6 暖色纸感 / v7 删除弹层+触屏常显 / v8 云端主键 `_id` / v9 习惯 upsert / v10 自绘日期时间面板 / v11 时间面板点击修复 / v12 时间选择改 iPhone 式循环滚轮 / v13 时间面板居中弹出 / v14 滚轮数字列内水平居中（`.dt-col button` 加 width:100%，button 是 shrink-to-fit）。

## 项目形态（重要，回答「后端代码在哪」类问题时用）
- **没有后端代码**。整个工作台 = 一个 240KB 的单文件 HTML（HTML/CSS/JS 全内联、零外部依赖）
  + 平台内置的 `window.__SMART_PAGE__.database` 读写通道 + 6 张纯数据表。
  页内 grep `require(`/`def`/`express`/`@app.route`/`<?php`/`func main`/`CREATE TABLE` 均为 0。
- **云端正本是唯一正本**，本地从不长期存放 index.html；每次改版都是临时下载→改→上传→提交，临时目录随手清理。
- **6 张数据表**（页面里常量名 → databaseId）：
  `DB_MONEY`=wMPUiJRjq1FFJjDkaRDauJ（记账） / `DB_FITNESS`=yUBsXsNzZ2vj7CuewMBpdQ（健身） /
  `DB_MEDIA`=B66hZomeHQTqJEWsIYxmCH（书影音） / `DB_HABIT`=6pJ5uqS3eeLVVnDfTh39qB（习惯） /
  `DB_PLAN`=fdubBrDZ1vcncxRNlD4hVr（周计划） / `DB_SHOPPING`=N0r7pAVJAK35d6XiK2NsP5（待买）
  个人空间 spaceId：`pHFugBpWhfhSI7GT5Gssex`
- **跨平台接手**：把节点 ID 给对方 + 要求「用资料库能力下载现有页面、在它基础上改、提交发布」。
  动手前必须验收下载到的 HTML 里有 `window.__SMART_PAGE__.database` 和 6 个 `DB_*` 常量；
  找不到就是拿错文件/要走重写 → 停，重写会丢表绑定（账单读不出来）。
- **本地快照保险**：`D:/my-project/生活工作台/backup/`（含 v14 双路径副本 + README 说明清单）。
  资料库**不支持版本回滚**，较大改动前先新增一份带日期的快照。
- 临时工件目录（tmp_*/verify_*）用完即清；`memory/` 必须保留。

## 托管页面编辑铁律
1. 改 HTML 一律以当轮事务 `.baseline/` 的**字节**为底做定向替换，禁用会全文件重写的方式
   （Edit 工具会把 CRLF→LF；python 必须 `io.open(..., newline='')`）。
2. 基线里可能带历史脏行尾（现有 57 处 `\r\r\n` + 1 处裸 `\n`）；diff 冒出"非本次改动"的块先查行尾。
3. 改动跨多监听器时序时，光读代码不够——提取问题代码块到 harness.html 用 agent-browser 跑断言。
4. 验证发布态用 `download_page_artifacts.py --source publish`，不要 curl 落地壳。
5. commit 用 `--cleanup-dir` 会删除整个工作目录（有时成功有时 fail-closed 留下）——要保留的补丁脚本/baseline 先移出再 commit。
6. 页内 SDK 记录主键是 `_id`（不是服务端 API 的 `record_id`），见 database-sdk-contract.md。
7. 时间面板 dtSet 会派发 input+change 事件——草稿保存/表单监听都依赖这个，别绕过 dtSet 直接改 input.value。
8. v12 滚轮：5 份循环拷贝（时 120/分 300 项），回绕守卫保 k∈[n,4n)，**纯 JS settle（140ms）**——CSS scroll-snap 在 innerHTML 重建后会乱吸附，弃用；居中公式必须乘每份项数 n（v12 曾漏乘导致打开偏 2 项）。
9. dt-pop 定位以 `.dt-wrap` 为参照（原生 input 已隐藏为 1px 宽）；v13 起 dt-pop 水平居中于触发框，视口不够时贴边 clamp。
