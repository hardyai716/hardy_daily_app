# 生活工作台项目长期约定（MEMORY.md）

## 最新访问与托管约定（2026-10-07 用户确认）
- 工作台仅允许本人登录后访问；继续使用 WorkBuddy 托管页面和业务数据。
- 历史上的“发布到公开链接供手机使用”已不符合新的权限要求。后续修改不能自动重新公开发布。
- 访问控制必须由平台权限实现，不能用前端登录框、隐藏按钮或浏览器本地标记替代。
- 页面和关联数据表的访问权限都需要核对；个人日常数据不得写入 Git 备份。
- 优先修复字段完整性、准确同步状态、失败重试与合并、稳定习惯 ID 及日期/时间显示一致性，保留既有暖色纸感。

页面：日常集 · 生活工作台（资料库节点 FxXXoCbSbuuHuowGoydwLH）
- 编辑态：https://www.workbuddy.cn/space/d/FxXXoCbSbuuHuowGoydwLH
- 历史公开态：https://workbuddy.link/p/FxXXoCbSbuuHuowGoydwLH（新要求下需取消发布，不再作为手机入口）
- 产物：index.html 与 life-all-in-one.html **字节相同**（同一页面两路径），改一个必须同步改另一个。
- 版本史：v6 暖色纸感 / v7 删除弹层+触屏常显 / v8 云端主键 `_id` / v9 习惯 upsert / v10 自绘日期时间面板 / v11 时间面板点击修复 / v12 时间选择改 iPhone 式循环滚轮 / v13 时间面板居中弹出 / v14 滚轮数字列内水平居中（`.dt-col button` 加 width:100%，button 是 shrink-to-fit）/ **v15 字段完整性与同步状态重写（补 40 字段 + 新增习惯定义、个人设置两表 + 习惯定义与打卡分离）/ v16 对齐双路径字节 / v17 修复同步循环卡顿（collectEntities O(n²)→O(n)、旧账目升级改有条件、addRecord 返回值兜底、SYNC_BATCH 限流、continuation 跳过全量 pull）/ v18 修复幽灵冲突（写入回读只比内容不比变更标记；全量拉取时两端一致即清冲突；acknowledgeTask 允许内容相等即完成；无队列项的冲突也可解析）/ v19 导出改标准 CSV（UTF-8 BOM + 引号转义 + CRLF + .csv + text/csv;charset=utf-8；健身零值保留；= + - @ 制表符开头加公式防护）**。
- 当前线上版本 v19（266517B，md5 `9b4bf2cb5af90d68ee4c3648ee3841b1`，未调用 publish_page.py）。回滚快照 `backup/日常集_v19_2026-10-07.html`。v15 模块在线上文件中的区域：`// v15 repair module.` 起、`const LANG_PARAM` 止——后续改同步逻辑可直接对该区域做字节替换，不必从 v14 基线重建。
- v19 本地候选位于 `candidate/v19/`：记账和健身导出从 HTML 伪 `.xls` 改为 UTF-8 BOM CSV，健身 `0` 值不再变空，文本公式前缀已防护；下载回归和 14 项同步回归通过，尚未提交云端。

## 项目形态（重要，回答「后端代码在哪」类问题时用）
- **没有后端代码**。整个工作台 = 一个 240KB 的单文件 HTML（HTML/CSS/JS 全内联、零外部依赖）
  + 平台内置的 `window.__SMART_PAGE__.database` 读写通道 + 6 张纯数据表。
  页内 grep `require(`/`def`/`express`/`@app.route`/`<?php`/`func main`/`CREATE TABLE` 均为 0。
- **云端正本是唯一正本**，本地从不长期存放 index.html；每次改版都是临时下载→改→上传→提交，临时目录随手清理。
- **8 张数据表**（v15 起；页面里常量名 → databaseId）：
  `DB_MONEY`=wMPUiJRjq1FFJjDkaRDauJ（记账） / `DB_FITNESS`=yUBsXsNzZ2vj7CuewMBpdQ（健身） /
  `DB_MEDIA`=B66hZomeHQTqJEWsIYxmCH（书影音） / `DB_HABIT`=6pJ5uqS3eeLVVnDfTh39qB（习惯打卡） /
  `DB_PLAN`=fdubBrDZ1vcncxRNlD4hVr（周计划） / `DB_SHOPPING`=N0r7pAVJAK35d6XiK2NsP5（待买） /
  `DB_HABIT_DEFS`=Sv1ZU584ikoavvvGj6ZEAn（习惯定义，v15 新增） /
  `DB_SETTINGS`=viryd40GCIsjUxkERyI5SG（个人设置，v15 新增）
  个人空间 spaceId：`pHFugBpWhfhSI7GT5Gssex`
- **跨平台接手**：把节点 ID 给对方 + 要求「用资料库能力下载现有页面、在它基础上改、提交私人资料库版本，不公开发布」。
  动手前必须验收下载到的 HTML 里有 `window.__SMART_PAGE__.database` 和 8 个 `DB_*` 常量；
  找不到就是拿错文件/要走重写 → 停，重写会丢表绑定（账单读不出来）。
- **本地快照保险**：`backup/`（当前含 v14～v18 双路径副本 + README 说明清单；优先使用最新 v18）。
  资料库**不支持版本回滚**，较大改动前先新增一份带日期的快照。
- 临时工件目录（tmp_*/verify_*）用完即清；`memory/` 必须保留。

## Git 仓库（2026-10-07 建立，用于版本回滚 + 跨设备搬运）
- 仓库：`git@github.com:hardyai716/hardy_daily_app.git`，分支 `main`，本地根目录就是 `D:/my-project/生活工作台/`
  （**独立仓库**，不是 D:/my-project 那个 hardy-windows-project；生活工作台目录内自成一个 .git）
- 已跟踪：`backup/`（页面快照） + `.workbuddy/memory/`（项目记忆） + `README.md` + `.gitignore` + `.gitattributes`
- **`.gitattributes` 必须是 `* -text`**：云端页面是 CRLF，若让 Git 做行尾转换（默认会 CRLF→LF），
  拉回来再上传就会"整个文件都变了"，回滚比对失效。已验证克隆后仍 CRLF=1413、md5 与云端一致。
- **`.gitignore` 排除 `import_work/`**（含 2026 真实账单原始数据，不上公开仓库）与 tmp_*/verify_*/*backup_v*/。
- 跨设备接手路径：clone → 取 backup/ 最新快照 → 交给 AI 走「资料库事务下载/定向修改/上传+提交私人版本」流程（见根 README.md）。
- 改版后应把新快照（`backup/日常集_vNN_日期.html`）提交并推送，让 git 成为版本回滚的唯一依据。
- **仓库在 `hardy_daily_app/` 这一层**（外层「生活工作台」不是 git 仓库）。远端
  `https://github.com/hardyai716/hardy_daily_app.git`，分支 main。
  本机 git 身份用仓库级 `git config user.name/user.email` 设为 `涛哥 <taoge@example.com>`（沿用历史提交）。
- 提交前必查：`git diff --cached --name-only | grep private_work` 必须为 0（那里有真实账单记录）；
  再用中文关键词扫 `repair/`、`candidate/` 确认只有合成数据。
  CRLF 用「暂存后字节数不变」校验，别只看 `.gitattributes`。

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
10. **新增 DOM 元素会导致双路径漂移**（v15 首次遇到）：提交后平台解析器给新插入的元素各追加
    `data-page-node-id` + `<!--pnid:...-->`，且两个 HTML 文件各自生成一套 ID → 两路径不再字节相同。
    → 修法：回读线上的 index.html，原样上传到 `life-all-in-one.html` 再提交一次；已有 pnid 会被保留。
    → 判断方法：把这两个模式归一化后比对，若相同就只是 ID 注入，不是补丁问题。
    只改 CSS/JS 不会触发（v14 及以前都是纯 CSS/JS 补丁，所以两路径一直字节一致）。
11. `create_database.py` 响应里 `space_id` 恒为空字符串；`build_v15.py` 会校验它等于私人 spaceId。
    先用 `node-info` 核实新表确实落在目标空间，再手工补 `space_id` 到保存的响应 JSON。
12. 数值列可用 `{"number": null}` 做更新清空（读回为 None）——2026-10-07 在测试表上已实测确认。
13. 平台**没有删表接口**；隔离测试表建了删不掉，需在 UI 手动删。建测试表要克制，别反复建。
14. 内置习惯 ID 是确定性的 `habit-${key}`（页面 `makeInitialState` 写死），迁移时无需从原设备导出定义。
15. **同步写回的判定只能比内容，不能比"变更ID"**（v18）：`变更ID` 只是一次写入的标记，
    云端回读可能滞后于写入（大批量改写时尤其明显）。旧代码 `saved.revision!==sent.opId||!same(...)`
    会把"写成功但回读拿到旧标记"判成冲突，且该冲突永不自愈（flushTask 见冲突就跳过）
    → 表现为用户没改任何数据却出现 N 项"冲突待处理"。排查时先查云端是否自洽
    （无重复稳定ID/变更ID、`完整数据` 与旧列推导一致、与升级前备份逐行比对）。
16. 本地存储键是 `richangji-state-v1`（不是 v2）；`normalizeState` 保留 `candidate.sync`。
    写复现脚本时必须用 v1，否则 `loadState` 返回空状态、看起来"一切正常"。
17. 复现脚本要跑**修复前和修复后两份字节**做对照：`repro_phantom_conflict.cjs <html路径>`。
    只跑修复后看到 PASS 说明不了问题——必须先证明修复前确实复现。
18. **发布态要用两个脚本交叉核验**：`list_page_publish_artifacts.py` 曾对同一状态返回过
    `code=56160 not published`，而 `download_page_artifacts.py --source publish` 却能取到产物
    （`--source publish` 取 `meta.publishVersion` 定格版本，不跟随最新编辑态）。
    2026-10-07 提交 v19 后发现发布态定格在 v18（266396B，不含 v19 改动）。
    → 结论：commit 不会推进发布态，但发布态可能由他人在 UI 打开；每次交付都要核一遍并告知用户。
19. 用户已在 UI 手动删除三张隔离测试表，并剔除了习惯定义表里的 `test` 自定义习惯（2026-10-07）。
