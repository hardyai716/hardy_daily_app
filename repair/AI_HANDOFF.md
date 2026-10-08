# 外部工具交接说明（务必转达给写代码的工具）

> 适用场景：**代码由外部工具（Cursor / Claude Code / 其他模型或 IDE）编写**，写完后再由 WorkBuddy 侧按标准流程提交。
> 这份文档就是给那个外部工具的「作业要求」。直接把它连同**基线文件**一起发过去即可。
> 与之配套的硬性门禁是 `repair/validate_candidate.cjs`；人工铁律另见 `README.md` 的「改页面的铁律」。

## 0. 一句话

**在我给你的基线文件上做定向修改，产出「双路径候选 + manifest」，能通过 `validate_candidate.cjs`。
不要重写、不要碰 11 个云表绑定、行尾保持 CRLF、不要自创同步协议、不要发布。**

## 1. 项目形态

- **单文件 HTML**：HTML / CSS / JS 全部内联，**零外部依赖**，没有后端、没有构建产物。
- 数据通道只有一个：`window.__SMART_PAGE__.database`（平台自带能力，不是自己写的代码）。
- 它下面挂着 **11 张云端数据表**，纯数据、无逻辑。
- **云端是唯一正本**；仓库里的文件只是快照副本，用于回滚和跨设备搬运。

## 2. 基线

| 项 | 值 |
| --- | --- |
| 基线文件 | `backup/日常集_v34_2026-10-08.html`（与 `life-all-in-one_v34_2026-10-08.html` 内容相同） |
| 字节数 | 401458 |
| SHA-256 | `1572eaa4e70aec96ebdbe277070819217bfecc59bf1827d5785a751879df93e1` |
| 对应版本 | 云端私人编辑态版本 35，页内 appVersion 34 / schemaVersion 6 |

**必须在这份上改。** 如果你拿到的是更早的快照（例如 `日常集_v33_…`），先说明，不要自己拼。

## 3. 硬约束（不可协商）

1. **绝不从头重写整个页面。** 重写会丢掉云表绑定，历史账目就一条都读不出来。只能在现有文件上做定向修改。
2. **保留这 11 个常量及其真实 `databaseId`**，一个字符都不能改；**不得新建 / 删除 / 替换 / 清空任何绑定**：

   | 常量 | databaseId |
   | --- | --- |
   | `DB_MONEY` | `wMPUiJRjq1FFJjDkaRDauJ` |
   | `DB_FITNESS` | `yUBsXsNzZ2vj7CuewMBpdQ` |
   | `DB_MEDIA` | `B66hZomeHQTqJEWsIYxmCH` |
   | `DB_HABIT` | `6pJ5uqS3eeLVVnDfTh39qB` |
   | `DB_PLAN` | `fdubBrDZ1vcncxRNlD4hVr` |
   | `DB_SHOPPING` | `N0r7pAVJAK35d6XiK2NsP5` |
   | `DB_HABIT_DEFS` | `Sv1ZU584ikoavvvGj6ZEAn` |
   | `DB_SETTINGS` | `viryd40GCIsjUxkERyI5SG` |
   | `DB_ASSET_ACCOUNTS` | `z3ZKTvlXqABNjVtkK4qVIe` |
   | `DB_ASSET_SNAPSHOTS` | `CQWfV6AiPdnQ7aF6Ax3qL2` |
   | `DB_ASSET_SNAPSHOT_ITEMS` | `l7KeEViudNhu2rrCAUI7Zb` |

3. 文件里必须仍能找到 `window.__SMART_PAGE__.database`。找不到就**停下报错**，不要猜、不要自己造一个。
4. **行尾必须全程 CRLF，不允许出现裸露 LF**；UTF-8 **无 BOM**；文件末尾保留换行。
   仓库有 `.gitattributes`（`* -text`）锁行尾；编辑时用不会做行尾转换的写法（Python：`open(..., newline='')`）。
   **不要**用会重排格式或转行尾的工具（Prettier、各类 formatter），**不要**引入任何 CDN / `require` / `import` / 外部依赖。
5. **版本号**：页内 `appVersion:NN,` 递增到目标版本；`schemaVersion` **保持 6 不变**；**不改云表结构**
   （`cloud_schema_changes = false`，不得增删字段）。
6. **优先只改 JS。** 新增**静态 DOM** 会触发平台在提交后注入 `pnid`，导致两个路径字节漂移，
   需要再用回读的 `index.html` 覆盖 `life-all-in-one.html` 多提交一轮，**白耗一个云端版本号**。
   能不加节点就不加；若必须加，交付时明确说明。
7. **不要自创同步 / 并发协议。** 平台 `updateRecord` 的契约只有
   `{ databaseId, recordId, properties? }` —— 按记录 ID **无条件增量更新**，返回 `{ id }`。
   **没有** CAS、**没有** 乐观锁 / 版本号、**没有** 按「变更ID」条件更新、**没有** 单记录事务。
   现有实现只能靠「写入前二次读取」「三方合并」缩小覆盖窗口。
   不要写平台不存在的原语，也不要声称并发覆盖问题已被彻底解决。
8. **不要发布。** 只改私人编辑态。公开发布必须由本人当次明确指令触发，禁止擅自发布或取消发布。
9. **禁止重复执行 v15 迁移**：字段升级（六表补 40 个字段）、习惯定义与打卡分离、两张新表（习惯定义 / 个人设置）绑定
   —— 都已在线完成，再做一次会破坏数据。

## 4. 交付物

```
candidate/v<N>/
├── index.html               # 与 life-all-in-one.html 逐字节相同（同一份内容写两遍）
├── life-all-in-one.html
├── manifest.json
└── （可选）WORKBUDDY_SUBMISSION.md   # 若提供，必须含正确的字节数与 SHA-256 字样
```

`manifest.json` 字段（参照 `candidate/v34/manifest.json`）：

```json
{
  "status": "local-candidate-not-deployed",
  "version": 34,
  "change": "<一句话说明>",
  "source": "backup/日常集_v34_2026-10-08.html",
  "generated_by": "repair/build_v<N>.py",
  "baseline_sha256": "<基线 sha256>",
  "candidate_sha256": "<候选 sha256>",
  "bytes": 401458,
  "two_paths_identical": true,
  "schema_version": 6,
  "app_version": 34,
  "database_bindings": 11,
  "cloud_schema_changes": false,
  "publish_requires_explicit_instruction": true
}
```

**强烈建议用「断言式 patch 脚本」生成**（参照 `repair/build_v34.py`）：每处替换前先核对目标字符串的出现次数，
基线不符就抛错停止，**禁止静默改错**；最后一次性把同一份内容写成两个路径。

## 5. 门禁：`repair/validate_candidate.cjs`

交付前必须通过（`node repair/validate_candidate.cjs candidate/v<N>`）。它断言：

- `index.html` 与 `life-all-in-one.html` **字节完全相等**
- 字节数 == `manifest.bytes`；`sha256(index)` == `manifest.candidate_sha256`
- `manifest.two_paths_identical == true`
- 页内 `appVersion` / `schemaVersion` == manifest 对应字段
- **全文 `\n` 数 == `\r\n` 数**（即不存在裸 LF）
- 11 个 `DB_*` 全部存在、**非空**、**互不重复**，且 `manifest.database_bindings == 11`
- 若存在 `WORKBUDDY_SUBMISSION.md`，其中必须包含正确的字节数与 SHA-256

过不了就别提交。

## 6. 回归清单（交付前自测）

| 关注点 | 脚本（`repair/` 下） |
| --- | --- |
| 备份恢复拒绝逻辑 | `restore-regression.cjs` |
| 凌晨 04:00 逻辑日切换 | `calendar-regression.cjs` |
| 同步冲突提示 / 写前二次读取 | `regression.cjs` |
| 移动端布局（320/375/390/414 无横向溢出） | `sync-card-stability-v33.cjs` |

## 7. 分工边界

- **外部工具负责**：写代码 → 产出 `candidate/v<N>/` 两个 html + manifest → 跑通 `validate_candidate.cjs` 与回归。
- **WorkBuddy 侧负责**：开页面事务 → 下载事务基线 → 用候选覆盖两路径上传 → 提交私人编辑态 → 回读校验 → （按需）处理 pnid 漂移对齐。
- 外部工具**不要**直接碰云端：不要自己上传、不要发布、不要改云表。
- 提交/对齐的惯例：**一个本地候选通常消耗 1～2 个云端版本号**（新增 DOM 时 = 2）。

## 8. 可直接粘贴的短指令块

```
项目：单文件 HTML 页面（WorkBuddy 资料库托管），HTML/CSS/JS 全内联、零外部依赖、无后端，
数据全部通过 window.__SMART_PAGE__.database 读写。请在"我给你的基线文件"上做定向修改，不要重写。

【硬约束】
1. 绝不从头重写整个页面 —— 重写会丢掉云表绑定，历史账目就全读不出来。
2. 保留这 11 个常量及其真实 databaseId，不得新建/删除/替换/清空：
   DB_MONEY=wMPUiJRjq1FFJjDkaRDauJ        DB_HABIT=6pJ5uqS3eeLVVnDfTh39qB
   DB_PLAN=fdubBrDZ1vcncxRNlD4hVr          DB_FITNESS=yUBsXsNzZ2vj7CuewMBpdQ
   DB_SHOPPING=N0r7pAVJAK35d6XiK2NsP5      DB_MEDIA=B66hZomeHQTqJEWsIYxmCH
   DB_HABIT_DEFS=Sv1ZU584ikoavvvGj6ZEAn    DB_SETTINGS=viryd40GCIsjUxkERyI5SG
   DB_ASSET_ACCOUNTS=z3ZKTvlXqABNjVtkK4qVIe  DB_ASSET_SNAPSHOTS=CQWfV6AiPdnQ7aF6Ax3qL2
   DB_ASSET_SNAPSHOT_ITEMS=l7KeEViudNhu2rrCAUI7Zb
3. 文件里必须仍能找到 window.__SMART_PAGE__.database；找不到就停下报错。
4. 行尾必须全程 CRLF，不允许出现裸 LF；UTF-8 无 BOM；末尾保留换行。
   不要用会重排格式或转行尾的工具（prettier 等），不要引入任何外部依赖 / CDN / require / import。
5. appVersion 递增到目标版本（页面内 appVersion:NN,）；schemaVersion 保持 6 不变；不改云表结构。
6. 尽量只改 JS，不要新增静态 DOM。（新增 DOM 会被平台注入 pnid，导致两个路径字节漂移，
   要多提交一轮、白耗一个云端版本号。）
7. 不要自创同步/并发协议。平台 updateRecord 只支持"按记录 ID 增量更新"，没有 CAS / 乐观锁 /
   按变更ID条件更新 / 单记录事务；只能用"写入前二次读取"缩小覆盖窗口。
   不要写平台不存在的原语，也不要声称并发覆盖问题已解决。
8. 不要执行任何发布动作，只产出候选文件。

【交付物】
- index.html 与 life-all-in-one.html：同一份内容写两遍，逐字节完全相同
- manifest.json：version / change / source / baseline_sha256 / candidate_sha256 / bytes /
  two_paths_identical=true / schema_version=6 / app_version=<N> / database_bindings=11 / cloud_schema_changes=false
- 若用脚本改，请写"断言式 patch"：替换前先核对目标字符串出现次数，基线不符就抛错停止，禁止静默改错。

【交付前自检，必须全过】
- 两路径字节数与 sha256 完全一致，且与 manifest 一致
- appVersion / schemaVersion 与 manifest 一致
- 11 个 DB_* 全部非空且互不重复
- 全文 "\n 数 == \r\n 数"（即无裸 LF）
- 回归通过：备份恢复拒绝逻辑、凌晨 04:00 逻辑日切换、同步冲突提示、移动端布局
```
