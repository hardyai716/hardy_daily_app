# 生活工作台项目长期约定（MEMORY.md）

## 最新访问与托管约定（2026-10-07 用户确认）
- 工作台仅允许本人登录后访问；继续使用 WorkBuddy 托管页面和业务数据。
- 2026-10-07 22:22 用户明确指令「执行发布」→ 页面已重新公开发布；23:05 随 v28 更新公开链接（同一链接）。
  是否发布以用户当次指令为准，不要自作主张。
- **已定案（2026-10-07 23:12 用户决定）：公开链接可被未登录访客读取全部真实个人数据，用户知情后明确表示
  「这个链接只有我自己在用，暂时不用考虑那么多」→ 保持发布现状，不做额外访问控制。**
  事实记录（2026-10-07 23:06 实测）：用全新无登录 Chrome（无 cookie/无 localStorage）打开
  `workbuddy.link/p/FxXXoCbSbuuHuowGoydwLH`，页面显示 940 条流水、真实商户名（京东外卖/德尔玛吸尘器…）、
  月度收入支出、习惯打卡，并写入 572KB 的 `richangji-state-v1`；证据 `private_work/v28-public-privacy.json`。
  → 后续不要重复劝说、**不要擅自 unpublish**；如用户改主意再执行取消发布。
- 访问控制必须由平台权限实现，不能用前端登录框、隐藏按钮或浏览器本地标记替代。
- 页面和关联数据表的访问权限都需要核对；个人日常数据不得写入 Git 备份。
- 优先修复字段完整性、准确同步状态、失败重试与合并、稳定习惯 ID 及日期/时间显示一致性，保留既有暖色纸感。

页面：日常集 · 生活工作台（资料库节点 FxXXoCbSbuuHuowGoydwLH）
- 编辑态：https://www.workbuddy.cn/space/d/FxXXoCbSbuuHuowGoydwLH
- 公开态：https://workbuddy.link/p/FxXXoCbSbuuHuowGoydwLH（2026-10-07 22:22 发布、23:05 更新为版本 24；HTTP 200。⚠️ 未登录即可读真实数据，见上）
- 产物：index.html 与 life-all-in-one.html **字节相同**（同一页面两路径），改一个必须同步改另一个。
- 版本史：v6 暖色纸感 / v7 删除弹层+触屏常显 / v8 云端主键 `_id` / v9 习惯 upsert / v10 自绘日期时间面板 / v11 时间面板点击修复 / v12 时间选择改 iPhone 式循环滚轮 / v13 时间面板居中弹出 / v14 滚轮数字列内水平居中 / v15 字段完整性与同步状态重写 / v16 对齐双路径 / v17 修复同步循环卡顿 / v18 修复幽灵冲突 / v19 标准 CSV / v20 沙箱下载 / v21 热力图标题 / **v22 完整备份恢复+空值清理 / v23 五类记录编辑 / v24 账目搜索日期分页 / v25 跨日+ISO 周计划 / v26 定向同步读取+存储保护 / v27 手机外观设置入口**。
- 当前线上**编辑态版本 35**（= 本地候选 v34 的内容，401458B，sha256 `1572eaa4e70aec96ebdbe277070819217bfecc59bf1827d5785a751879df93e1`，两路径字节一致，无 pnid 漂移；appVersion 34、schemaVersion 6）。提交事务 `tx_4VfZCeb6HGPAxm6iaFRiTt`（baseVersion 34 → newVersion 35，提交信息「加固备份校验、写入前冲突检查与逻辑日切换」）。回滚快照 `backup/日常集_v34_2026-10-08.html`（v33/v28/v27/v21 快照仍保留）。上一版线上编辑态是版本 34（= v33 内容，390732B，sha256 `a38ee4d0…`，appVersion 33）。
- **v34 提交实测：无 pnid 漂移**（v34 改动全在 JS 内，未新增静态 DOM，`build_v34.py` 也只做 JS 替换）→ 一次提交即两路径逐字节一致，无需再对齐一次。**公开态未动**：publish 快照仍为 390186B / appVersion 32 / sha256 `a3bf7435…`（本次提交前后一致，未发布）。
- v15 模块在线上文件中的区域：`// v15 repair module.` 起、`const LANG_PARAM` 止。
- **本地候选 → 云端版本对照（每次都因 pnid 漂移占两个云端版本号）**：v28→24；v29→25/26；v30→27/28；v31→29/30；v32→31/32；v33→**33/34**；v34→**35（无漂移，只占一个号）**。即「提交一次 +（如漂移）对齐一次」。**v34 起若改动只在 JS、不新增静态 DOM，则一次提交即对齐**（v28/v34 均验证）。
- **SDK 原子能力核实（2026-10-08）**：`window.__SMART_PAGE__.database.updateRecord` 只有 `{databaseId, recordId, properties?}` 按记录 ID 的增量更新，返回 `{id}`；agent 侧 `batch-update-records` 也只有 `recordId+properties`（1–100 条）。**不支持** CAS、按「变更ID」条件更新、乐观锁版本号、单记录事务；契约里无任何版本/条件/冲突失败返回语义（`database-sdk-contract.md` 方法集见 §11）。→ 多设备并发覆盖只能靠页面「写入前二次读取」缩短窗口，**不要宣称已被原子能力彻底解决**。
- **平台其实提供文件/图片上传通道（2026-10-08 核实，页面尚未使用）**：SDK 契约 `page/database-sdk-contract.md` §7/§9 有
  `db.uploadImage({data, contentType?, fileName?}) → url`（不需要 databaseId）、`db.uploadFile({nodeId, file}) → AttachmentItem`、
  `db.getDownloadUrl` / `db.getPreviewUrl`。契约明确警告：**不要把 `data:image/...;base64,` 写进 `imageUrl`**（死链）。
  → 但 v34 页面里 `uploadImage`/`uploadFile`/`getDownloadUrl`/`getPreviewUrl` 的**调用数均为 0**。
- **书影音封面现状（v34 实测）**：`EXTRA_FIELDS.media` 有独立文本列 `'封面内容':'text'`，存的是 canvas 压出来的 base64
  （`canvas.toDataURL('image/jpeg',.72)`，长度超 `COVER_MAX_CHARS=260000` 再降质量到 .5）；渲染处 `<img src="${item.cover}">`。
  本机缓存警戒线 `LOCAL_STATE_WARN_BYTES=4MB`。→ 一张封面最多约 26 万字符，既进云端文本列也进 localStorage。
  **因此「封面改走 uploadImage、`封面内容` 由 base64 换成 URL」无需改云表结构**（仍是同一 text 列），但需先实测沙箱 iframe 内能否调用 uploadImage。
- **2026-10-08 14:08 用户决定：书影音暂不调整；v34 收尾，进入稳定观察期（约 3～7 天），本轮不做 v35。**
  → 不要主动重提封面迁移/性能局部渲染/IndexedDB 迁移；观察期只在出现异常（待同步堆积、冲突自发出现、
  本机缓存逼近 4MB、04:00 逻辑日异常）时才开新版本。**当前线上私人编辑态 = 云端版本 35 / appVersion 34 / schemaVersion 6**
  （双路径 401458B / `1572eaa4…`，无 pnid 漂移），公开态未动。
- **11 张表**：8 张原表 + 3 张资产表（v32 新建）：`DB_ASSET_ACCOUNTS=z3ZKTvlXqABNjVtkK4qVIe` / `DB_ASSET_SNAPSHOTS=CQWfV6AiPdnQ7aF6Ax3qL2` / `DB_ASSET_SNAPSHOT_ITEMS=l7KeEViudNhu2rrCAUI7Zb`；页面↔表关系 11/11。
- **2026-10-08 11:48 用户决定：跳过 v33 重复提交。** 核查发现 v33 早已部署（cloud 33 + 对齐得 34），候选与线上除 pnid/属性顺序/空白外零差异 →
  未重复提交、未发布、线上未被改动。教训：**收到「提交 vX」指令先量测线上真实状态**（事务 baseVersion + 页面 appVersion + `--version N` 取回历史版本 + 候选对线上的语义 diff），
  别只信指令里的「当前已部署的 vN」前提，避免无意义的重复提交与版本/pnid churn。
- v28 已部署（云端编辑态 24，事务 `tx_632WGaY6ac8IRhhdIGGVdZ`，baseVersion 23，提交信息「优化同步状态文案，将删除标记移入诊断详情」）：仅 4 处 JS 改动——`renderSyncStatus` 增加刷新 `#syncDiagnosticsText`；备份 `appVersion:27→28`；`startSync()` 调 `setupSyncDiagnostics()`；`storageSummary()` 重写为「本机缓存约 X · <状态>」（去掉删除标记），新增 `storageDiagnostics()`（含删除标记数 + 无需处理）与 `setupSyncDiagnostics()`（运行时 `document.createElement('details')` 动态创建折叠面板）。
  → **新增 DOM 用 createElement 动态创建（不写进静态 HTML）→ 不触发平台 pnid 注入，两路径提交后直接字节一致**（这是避免漂移的可复用手法）。
  候选上传字节 313311B/sha256 `6268e3fc…`；回读与候选逐字节相同。验收：真实页面 6 项全过（正常态文案「本机缓存约 1.09 MB · 同步正常」、主状态无删除标记、诊断详情默认折叠、展开显示「删除标记 2 项 … 无需处理」、搜索/日期区间/加载更多/编辑/备份恢复正常），0 page error。
- **本地候选版本号 ≠ 云端版本号**：本地按 feature 累积编号（v21→v27 六个候选），云端每次 commit 只 +1。故本地 v27 提交后云端是 **22 →（对齐一次）→ 23**。以后汇报要同时给出「本地候选号」和「云端版本号」。
- v27 已部署（云端编辑态 23，两个事务 `tx_DavaWAX2xFd0EhdmLgv9mY`(base 21→v22) + `tx_atBZKgiYSvsSKeVcFos9ub`(base 22→v23)，提交信息「完善备份恢复、记录编辑、账目检索及跨日同步」/「对齐两个页面路径的字节」）：v22–v27 累积功能（完整备份恢复、五类记录原位编辑、账目搜索/日期范围/加载更多、跨日刷新、ISO 周计划、定向同步读取、封面容量保护、手机外观入口）。候选上传字节 310485B/sha256 `4c3be941…`；平台为新 DOM 注入 pnid 后两路径各成一套 ID（回读 311348B），按老办法用回读的 index.html 覆盖 life-all-in-one.html 再提交一次即对齐。验收：两路径字节一致、8 表关系 8/8、页面+空间协作者仅本人 owner、真实页面加载「记录已同步」0 error、本地字节 16 视图/8 绑定/4 功能标记 0 error。
- **发布态与编辑态是两套产物**：`--source publish` 取的是发布快照（独立目录）。commit 不推进公开态，需显式 `publish_page.py`。历次公开态目录：v21 `G3nH_jfGIzkl` →（22:22 发布）v23 `d7RuKAnXHUit` →（23:05 发布）v24 `xVoBsy92FpOJ`（两路径 sha256 `6268e3fc…`）。公开链接地址始终不变（更新而非新建）。
- v20 已部署（云端版本 20，267443B，md5 `19c90688a229f4ea7a7d23d7beb271e1`）：共用 `downloadBlob` 改为在 `allow-popups-to-escape-sandbox` 允许的非沙箱弹窗中触发下载；等价 sandbox 回归 + 真实托管页面点击验收均通过（记账 CSV / 健身 CSV / 完整 JSON 备份三项正常）。
- v21 已部署（云端版本 21，提交 `tx_6JCsjaCyAdEL7CSxrwoX3Q`，baseVersion 20，提交信息「修复下载按钮和热力图标题显示」，未公开发布）：在 v20 下载修复之上，为习惯页热力图标题行（`.heatmap-panel .panel-head`）增加 `padding-inline:6px`，两处辅助文字（`.eyebrow` / `.mini-note`）由 10px 浅灰改为 11px `#6f655b`，`.mini-note` 加 `flex:0 0 auto;white-space:nowrap`。真实托管页面验收：下载三项正常、标题 1440/390 左右端内缩 7px 无裁切、0 page error。两路径提交后仍字节一致（无 DOM 新增，无 pnid 漂移）。
- 上一版本 v19 的说明：v19 已把记账和健身导出从 HTML 伪 `.xls` 改为 UTF-8 BOM CSV，健身 `0` 值不再变空，文本公式前缀已防护；提交后发现 WorkBuddy iframe 的 sandbox 缺少 `allow-downloads`，页内 `<a download>` 被 Chrome 拦截（正是 v20 修的）。

## 项目形态（重要，回答「后端代码在哪」类问题时用）
- **没有后端代码**。整个工作台 = 一个约 310KB 的单文件 HTML（HTML/CSS/JS 全内联、零外部依赖）
  + 平台内置的 `window.__SMART_PAGE__.database` 读写通道 + 8 张纯数据表。
  页内 grep `require(`/`def`/`express`/`@app.route`/`<?php`/`func main`/`CREATE TABLE` 均为 0。
- **云端正本是唯一正本**；本地 `backup/` 和 `candidate/` 只保存回滚快照及待提交候选。
- **8 张数据表**（v15 起；页面里常量名 → databaseId）：
  `DB_MONEY`=wMPUiJRjq1FFJjDkaRDauJ（记账） / `DB_FITNESS`=yUBsXsNzZ2vj7CuewMBpdQ（健身） /
  `DB_MEDIA`=B66hZomeHQTqJEWsIYxmCH（书影音） / `DB_HABIT`=6pJ5uqS3eeLVVnDfTh39qB（习惯打卡） /
  `DB_PLAN`=fdubBrDZ1vcncxRNlD4hVr（周计划） / `DB_SHOPPING`=N0r7pAVJAK35d6XiK2NsP5（待买） /
  `DB_HABIT_DEFS`=Sv1ZU584ikoavvvGj6ZEAn（习惯定义，v15 新增） /
  `DB_SETTINGS`=viryd40GCIsjUxkERyI5SG（个人设置，v15 新增）
  个人空间 spaceId：`pHFugBpWhfhSI7GT5Gssex`
- **跨平台接手**：把节点 ID 给对方 + 要求「用资料库能力下载现有页面、在它基础上改、提交资料库版本，是否公开发布按当次指令」。
  动手前必须验收下载到的 HTML 里有 `window.__SMART_PAGE__.database` 和 8 个 `DB_*` 常量；
  找不到就是拿错文件/要走重写 → 停，重写会丢表绑定（账单读不出来）。
- **本地快照保险**：`backup/` 当前最新线上快照为 v21；待提交功能在 `candidate/v27/`。
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
18. **发布态要用 `--source publish` 核**（它取 `meta.publishVersion`，`list_page_publish_artifacts.py`
    曾对同一状态返回 `code=56160 not published`，结论不可靠，别用它下判断）。
19. **发布与否只按用户当次明确指令办**（2026-10-07 更新）：22:22 用户指令「执行发布」，23:05 更新公开链接到版本 24。
    不要自作主张发布，也不要在用户没要求时执行 `unpublish_page.py`。
    已实测「公开链接对未登录访客可读全部真实账目」，用户 23:12 知情后明确接受（「链接只有我自己在用」）→
    保持现状、不重复劝说、不擅自取消发布。
20. 提交私人页面后必须回读两个路径和 8 张表绑定；新增 DOM 可能被平台注入不同 pnid，必要时用回读
    `index.html` 覆盖另一条路径再提交一次。
    → **更优解：新增 DOM 改用 `document.createElement` 在运行时创建（不写进静态 HTML），就不会触发 pnid 注入**（v28 已验证）。
    未登录/其他账号的权限验收必须在提交/发布后立即用**独立无痕环境**实测（v28 因此发现了公开链接泄露真实数据）。
21. 用户已在 UI 手动删除三张隔离测试表，并剔除了习惯定义表里的 `test` 自定义习惯（2026-10-07）。
22. **页面内点击验证的套路**（2026-10-07 摸索出来）：私有空间必须登录 → 用 Playwright
    `launchPersistentContext` + 系统 Chrome（`executablePath`）**有头**跑一次让用户登录，
    之后同一 profile 可**无头**免登录复跑。脚本 `private_work/verify_v20_clicks2.cjs`。
    - 有头模式浏览器会在弹窗/下载出现后被整体关闭（三次复现）→ **验证一律用无头**。
    - agent-browser 的 Chromium 下载经常超时，别依赖它；系统 Chrome 更稳。
    - 识别工作台 iframe 要按元素（`#saveText`），不要按 URL 匹配。
    - 点导出前先切到对应视图，否则按钮不可见会 30s 超时。
    - 用 `downloadsPath` + `download.path()` 取文件，别只信 download 事件。
    - **差点误判**：探针看到弹窗 `origin === "null"` 就推断「Blob 建在 iframe 里弹窗取不到」，
      实测证明原实现没问题。源为 null ≠ 取不到 blob URL——拿落盘文件说话，别拿推断下结论。
23. v22-v27 的关键边界：备份格式仍为 `richangji-recovery-v22`、schemaVersion 3，`appVersion` 为 27；
    提醒只保存意愿，不承诺网页关闭后推送；SDK 无条件更新/原子唯一约束，不能承诺同记录跨设备严格串行；
    删除保留云端软删除标记，不在缺少安全保留期和条件删除能力时自动物理清理。
