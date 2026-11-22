# P029 TableFork — 独立审查报告（P029-T014）

- 审查者：T014 独立审查会话（本文件作者）
- 规格版本：v1.0.1（冻结）
- 基线 HEAD：`fb88a25cbf05f24591a68d19e18b95c84d964054`（冻结发布提交 `f53cef4f89601be68c607e181145981d1c5d6025`）
- 审查日期：2026-11-21 ~05:03–05:40 GMT
- 结论：**READY_FOR_FINAL_REVIEW**（无 P0/P1；全部遗留项均为 P2 可延期；新增一条 P2 记录项 ISSUE-T014-1）
- 复测原始记录：`artifacts/logs/T014-review.txt`（本审查的全部命令、真实退出码与关键输出）

## 1. 审查者独立性声明

本审查由与 T003–T013 构建者**不同的全新会话**执行。本审查者没有参与任何构建卡，没有复用构建者的会话记忆；`COORDINATOR_LOG.md`、`S0_REPORT.md` 与各卡交接 JSON 只作线索使用，报告中的每一个结论都来自本审查者自己读源码、自己跑命令、自己重算的结果——凡是只在构建者日志里出现、而本审查者没有亲自复现的说法，本报告都不采信为结论（只在“线索”处注明出处）。

本审查没有调用任何外部模型 API，没有使用 Qoder，没有使用 WorkBuddy（Sam 的电脑已关机），没有触碰任何密码/密钥原文；全部工作是本地读文件与本地运行命令。审查者没有修改任何业务代码：`src/`、`oracle/`、`cli/`、`tests/`、`fixtures/`、`docs/`、四份规格、Goldens、发布 ZIP、清单、`REVIEW_PACK`、`bundle/`、`drive-copies/`、`v1.0.0-archive/`、`S0_REPORT.md`、`COORDINATOR_LOG.md` 均未改动；e2e 运行写脏的两个日志文件已用 `git checkout --` 恢复，工作树在审查结束时干净（仅未跟踪的协调员文件与 `test-results/`）。

环境：Node v24.22.1、npm 10.9.4、Python 3.12.3、Chromium 159.0.8154.6、Linux x64、共享 VM（1.5 vCPU）。

## 2. 已读 / 未读状态表

精读 = 全文逐行读过；核对 = 按 REVIEW_PACK 逐卷核对过内容与哈希；略读 = 读过结构与关键段落。

### 2.1 规格与审查包（全部已读）

| 文件 | 状态 | 备注 |
|---|---|---|
| `docs/PROJECT_BOOK.md` v1.0.1 | 精读 | 重点 §3.3、§5、§6、§7、§8；并从文件本身提取 §6.3 Markdown 块重算哈希（见 §5） |
| `docs/IMPLEMENTATION_PLAN.md` v1.0.1 | 精读 | 重点 §6 T014 卡与 §12 终审接收合同 |
| `review/REVIEW_INDEX.md` | 精读 | 分卷表、49 代码文件、125 非代码清单文件 |
| `review/REVIEW_PACK_01.md` | 核对 | 11 块；手工解析抽验 11/11（块头 SHA 与源文件一致，内容+末尾 LF 逐字节一致，见 §8） |
| `review/REVIEW_PACK_02.md` | 核对 | 15 块；内容即下面已精读的源码文件，verify 49/49 覆盖 |
| `review/REVIEW_PACK_03.md` | 核对 | 9 块；内容即测试文件，见 §2.3 |
| `review/REVIEW_PACK_04.md` | 核对 | 7 块；property/e2e 测试，见 §2.3 |
| `review/REVIEW_PACK_05.md` | 核对 | 7 块；含 `oracle/reference.py`、`scripts/verify_release.mjs` 全文 |
| `review/RELEASE_MANIFEST.json` | 精读 | 174 文件 + 两 ZIP + 5 卷；逐文件比对见 §8 |
| `review/SCREENSHOT_INDEX.md` | 精读 | 13 张截图映射；两张与 T009 同哈希已有说明（确定性渲染） |
| `COORDINATOR_LOG.md` | 精读（仅作线索） | T013-FIX-01 记录与 ISSUE-T013-5/6 的声明以本审查复核为准 |
| `S0_REPORT.md` | 精读（仅作线索） | P1-01 勘误已在 v1.0.1 中；§5.4 勘误行已在规格文件中亲自核实存在 |

### 2.2 冻结源码（精读文件）

| 文件 | 行数 | 精读结论摘要 |
|---|---|---|
| `src/core/witness.ts` | 401 | 选择顺序、拆分重建、重验、标题路径比较均与 §5.2/计划 §4.1 一致；J-T005-1~7 注释与代码行为一致（J-T005-7 已独立复现） |
| `src/core/flatten.ts` | 91 | 两策略、转义顺序（先 `\` 后 `|`）、末行 LF 口径与 §5.1 一致；J-T004-1 已核 |
| `src/core/grid.ts` | 180 | 首空列放置、重叠/ragged/跨节/上限拒绝与 §3.2 一致；cellId 排序口径正确 |
| `src/core/parse.ts` | 765 | 手写分词器、7 码兜底、实体表、隐含闭合、scope/headers 语义与 §3.1 一致；J1 已核 |
| `src/core/headers.ts` | 111 | 列/行路径、cellId 去重、UNKNOWN 口径与 §3.3 一致；不编造标题 |
| `src/core/records.ts` | 93 | 逐槽 TD-only 事实、行标题 `?`、字符串值与 §5.4/§3.3 一致；J-T008-4 已核 |
| `src/core/report.ts` | 178 | 流程与失败语义与 §6.1/§6.2 一致；哈希复核为同一实现两遍（L2 已核）；`UNSUPPORTED` 不可达（J-T008-1 已核） |
| `src/core/compare.ts` | 467 | 严格 UTF-8 字节比较、首字节定位、GFM 诊断与 §5.3 一致；不做 normalization；J-T007-1/4 已核 |
| `src/core/sha256.ts` | 132 | 纯 TS 同步 SHA-256（FIPS 180-4）；K/H0 常量、填充、64 轮均与规范一致；与 Node crypto 交叉核对通过（见 §5） |
| `src/core/types.ts` | 145 | 全部类型/枚举/常量与项目书 §6.1 逐字段一致；7 个错误码齐全 |
| `src/core/index.ts` | 118 | 全部核心模块挂载，去重口径（sha256Utf8 / isTableForkError 各一处出口）合理 |
| `oracle/reference.py` | 1102 | 全文精读；独立实现（仅标准库，无 subprocess/Node/TS 引用）；解析/网格/标题/双 F/见证/错误码与书面合同一致；O1（T011-FIX-01 后忽略未知属性）、O6 已核 |
| `cli/analyze.ts` | 212 | 与 UI 同一 `analyze()` 内核；退出码 0/1/2 口径钉死；离线本地读写 |
| `src/worker/tablefork.worker.ts` | 198 | 唯一 Worker；jobId/版本号/取消集合三重守卫；macrotask 让步的理由成立 |
| `src/worker/protocol.ts` | 100 | 消息形状与类型守卫与 §6.2 一致 |
| `src/ui/App.tsx` | 407 | Worker 接线、jobId 采纳、取消、清空；L3（NO_WITNESS_FOUND 时再调一次 findWitness）已核 |
| `src/ui/DualTableView.tsx` | 214 | 双表 + 中央 Markdown；只用 React 文本节点，无 innerHTML；坐标/cellId/徽标齐全 |
| `src/ui/ProofPanel.tsx` | 170 | 两件事分开显示；断言、首字节定位、警告与 §4.2 一致 |
| `src/ui/InputPanel.tsx` | 236 | 预设/粘贴/本地文件/策略/比较-取消；剪贴板失败有回退提示 |
| `src/ui/ExportPanel.tsx` | 146 | 交接稿/JSON 两标签、复制/下载/清空均真实；Blob URL 及时 revoke |
| `src/ui/MarkdownPanel.tsx` | 47 | 行号映射 `line(r)=r+(r≥1?1:0)` 正确；末行 LF 产物已处理 |
| `src/ui/presets.ts` | 90 | TFK-A 为 §6.3 原文；4 预设与 `fixtures/TFK-*.json` 一致（T010 已核，本审查抽验 TFK-A） |
| `src/io/localText.ts` | 120 | 只读本地粘贴/文件/Blob；远程 URL 直接拒；64 KiB 上限 |
| `scripts/verify_release.mjs` | 595 | 全文精读；20 项检查逻辑与文件头说明一致；VOLATILE_RUN_OUTPUTS 排除只影响“工作树哈希”一项，清单/ZIP/HEAD 三方比对不受影响 |

### 2.3 测试与配置（核对 / 略读）

| 文件 | 状态 | 备注 |
|---|---|---|
| `tests/core/*.test.ts`（9 文件） | 略读 + 运行实证 | 结构与覆盖已核：grid 56、compare 29、flatten 19、witness 17、report 17、worker 13、golden 11、sha256 4、report-facts 2（grep 计数）；719/719 通过 |
| `tests/property/crosscheck.test.ts` + `compare.ts` + `generator.ts` | 精读关键逻辑 | 200 固定种子 TS↔Oracle 逐字段比对；O6 口径：altHtml 字符串不比对，重解析后比 graph；本轮 0 原始字符串差异 |
| `tests/e2e/tablefork.e2e.ts` | 略读（20 条用例名全核） | 4 预设×状态、策略切换、编辑、复制、导出、取消/竞态、清空、离线、安全、存储、390px、键盘；20/20 通过 |
| `tests/e2e/performance.e2e.ts` + `perf-table.ts` | 精读 | 32×12 确定表、30 次、隔离串行、p95≤500ms 断言；本轮 p95 309.6ms |
| `package.json` / `tsconfig.json` / `vite.config.ts` / `playwright.config.ts` / `index.html` | 精读 | scripts 与计划 §2.3 一致；`test:e2e` 为 functional 项目，`test:e2e:perf` 为 perf 项目；tsconfig 已含 cli/（T010 遗留已修） |
| `src/main.tsx` / `src/ui/styles.css` / `src/vite-env.d.ts` | 略读 | 无远程字体/样式/脚本引用（grep 无 http/https/@import/url()）；离线入口正常 |
| `fixtures/golden/G01..G48.json`、`fixtures/TFK-A..D.json` | 抽查 | G09/G17/G25/G33/G44 逐个核对；其余由 oracle 48/48 与 test:core 覆盖 |
| `oracle/golden_expected.json` | 抽查 | 48 条；G17 见证含 alternative_html（Oracle 自检内比较）；G44 为 INVALID_SPAN 错误条；fixture 输入与 expected 输入逐字一致（G44 已核） |
| `T012-performance.json` | 精读 | 六组数据集齐全；隔离法说明与 2 worker 并行污染解释自洽 |

**未读：** 无。上面列出的精读/核对文件覆盖全部 49 个代码文本文件；非代码清单文件（日志、截图、docx）以清单 SHA 与运行实证核对，未逐字通读日志全文——日志是证据记录而非代码，本审查的结论不依赖日志文字。

## 3. 独立复测：命令、退出码与关键数字

全部命令由本审查者亲自运行；退出码为真实值（非管道值）。

| 命令 | 退出码 | 关键数字 |
|---|---|---|
| `npm run test:core` | 0 | **719/719**，10 文件，4.91s；crosscheck 205（含 200 种子 + cap128/cap127）全部 AGREE；O6 原始字符串差异 0 |
| `npm run oracle` | 0 | **48/48 passed**（0 failed） |
| `npm run verify:release`（树干净） | 0 | **RESULT: PASS，20/20**；唯一 WARN 为 3 个打包后新增文件（T013-FIX-01.txt、两份 T013 交接 JSON，设计如此） |
| `npm run verify:release`（两日志文件被 e2e 写脏、不恢复） | 0 | **RESULT: PASS**；工作树检查 172/172 OK，2 易变文件 skipped——ISSUE-T013-6 决定性复核通过 |
| `npm run test:e2e` | 0 | **20 passed**，25.2s；取消/竞态、离线零请求、`<script>`/`<img>` 安全、零存储写入、390px、键盘均通过 |
| `npm run test:e2e:perf`（隔离串行） | 0 | **1 passed**，19.0s；n=30，min 160.9，**p50 203.2，p95 309.6**，max 310.9，目标 ≤500ms |
| `npm run typecheck` | 0 | — |
| `npm run build` | 0 | 2.03s；dist 与 verify 的全新构建逐字节一致 |
| `npm run analyze -- --input fixtures/TFK-A.json` | 0 | CERTIFIED_COLLISION，源格 c01，facts 3 条（见 §5） |

隔离 p95 历史（9 组独立测量）：257.5 / 263.2 / 282.8 / 286.0 / 295.2 / 301.6 / **309.6（本轮）** / 312.7 / 373.8，全部 ≤500ms；唯一超标为 515.9ms 一次离群（ISSUE-T013-1，见 §7）。

## 4. 代码审查发现（按严重度）

**P0/P1：无。** 精读中没有发现核心算法错误、错误的安全处置、虚假证书、数据泄漏、与冻结规格相抵触的行为。

**值得终审注意的已确认行为（均已裁决为 P2，见 §7）：**

1. **J-T005-7（REPEAT_VALUE 下选 rowspan 格）**——本审查者独立复现：§6.3 例在 REPEAT_VALUE 下确实选中 c00（rowspan“产品”），B 图哈希 `ba552bb4…1bd1`，且 col0 路径变为 `['产品','产品']`。这是冻结 §3.3（去重只按 cellId，不按文本）与冻结选择顺序共同决定的结果，Oracle 逐字节一致。这不是实现错误，但 GPT 终审应知：同一张表在两种策略下选中的源格不同，且“标题路径改变”在此例中来自重复文本而非新的语义归属。
2. **J-T008-4（SHARED_SOURCE_CELL 字面标注缺失）**——`SHARED_SOURCE_CELL` 字符串只出现在注释里，从未进入任何输出。§3.3 要求“标注”，但冻结的 `SlotFact`（§6.1）没有该字段、`§5.4` 行格式也没有该标注的位置；逐槽事实 + 共享 cellId 已完整表达同一信息（G25：c04 出现两次）。这是两处冻结规格之间的小冲突，实现选择了冻结类型，本审查者认为合理（见 §7）。
3. **L2（analyze 内部哈希复核同一实现算两遍）**——`report.ts` 的复核用同一 `sha256.ts` 实现重算，只能捕获装配错误，不能算独立验证。真正的独立性由 TS↔Oracle 交叉核对提供（719 测试 + 48/48 + 200 种子），这一点是成立的；只是注释不应被误读为“两个独立实现”。
4. **ISSUE-T014-1（新增，P2）：`packaged_from_head` 的注释口径不精确**——见 §8。实质无损（ZIP 内容与冻结提交 174/174 一致），但清单注释的一句话夸大了该字段的含义，已逐字记录，建议下次重打时改一句注释，并在终审消息草稿中直接写明真实数字以免 GPT 误判（草稿已如此写）。

其余逐项裁决见 §7。

## 5. 独立重算关键结果（不只信日志）

### 5.1 §6.3 示例五组哈希（自写脚本调冻结 `analyze()`，Node crypto 交叉核对）

| 量 | 本审查者重算值 | 预期 | 结果 |
|---|---|---|---|
| aGraph SHA-256 | `dbd4b9cebec9a13f40cfdff378c78d1f59325cdc0e721faa0b4068eb90de157d` | `dbd4b9ce…157d` | 一致 |
| bGraph ORIGIN_EMPTY（源格 c01） | `a9ec182caf420715248a255286d2daef973a8e22719691db813dd05d88238bc5` | `a9ec182c…38bc5` | 一致 |
| bGraph REPEAT_VALUE（源格 c00） | `ba552bb47172087248e45ce9ad5d71a8c5a4435719c1faac360be665c17e1bd1` | `ba552bb4…1bd1` | 一致 |
| Markdown ORIGIN_EMPTY（87 字节） | `83da510440918640ba87eff47fa11cad70444955f6ce7e36724e4d26765338c1` | `83da5104…38c1` | 一致 |
| Markdown REPEAT_VALUE（103 字节） | `e97edc1bda41731291466e2a64d0338df9abcf7b30f947ce1768592eba0bdffb` | `e97edc1b…bffb` | 一致 |

另：直接从 `docs/PROJECT_BOOK.md` 文件提取 §6.3 Markdown 块重算得 87 字节、SHA `83da5104…`，与 `F(A)` 逐字节一致——末行 LF 口径（J-T004-1）有规格文件自身的锚点。Node `createHash` 对两份 Markdown 的复算与纯 TS `sha256.ts` 完全一致。

### 5.2 CLI 分析 TFK-A（`npm run analyze`，exit 0）

CERTIFIED_COLLISION，源格 c01，splitCost 1，headerAssociationChanged true；三哈希与 §5.1 完全一致（a `dbd4b9ce…157d`、b `a9ec182c…38bc5`、md `83da5104…38c1`，Python hashlib 独立复算 md SHA 一致）；facts 3 条：(2,0,c04,A)、(2,1,c05,120)、(2,2,c06,80)，列标题分别为 `[产品]`、`[2026预算,收入]`、`[2026预算,成本]`，行标题均空、headerStatus UNKNOWN——与 v1.0.1 勘误后的 §5.4 示例一致（120 的来源确为 c05，行标题确为 `?`）。

### 5.3 随机 Golden 双向核对（G09 除外，TS `analyze()` vs Python Oracle 直接调用）

- **G17**（ORIGIN_EMPTY）：双方一致。CERTIFIED_COLLISION，源格 c02，HEADER_ASSOCIATION_CHANGED；a `e8cc6d3e…ad77`、b `b266ae5e…94d`、md `74d6a224…e639`；facts (1,1,c03,甲)(2,1,c04,乙)；交接稿含“行标题: 研发 | 列标题: 项目”。
- **G33**（ORIGIN_EMPTY）：双方一致。NO_WITNESS_FOUND；f_origin/f_repeat SHA `be47d17b…578b7`；facts 含转义用例 `a|b`、`c\d`、`e\|f`、`g`，双方逐字一致。
- **G44**（ORIGIN_EMPTY）：双方一致拒绝。Oracle 抛 `rowspan=9 outside 1..8`，TS 抛 `INVALID_SPAN`；`golden_expected.json` 该条确为 `{"error": {"code": "INVALID_SPAN"}}`；fixture 输入与 expected 输入逐字一致。
- **G25**（ORIGIN_EMPTY）：双方一致。CERTIFIED_COLLISION，源格 c00；a `a662f342…83c2`、b `2feeef09…684`、md `60c9b88b…f53`；facts 含同一来源 c04 两次（(2,0) 与 (3,0)，值“左”）——共享来源格逐槽出记录的活证据。

## 6. 安全与离线抽查

- `src/`、`cli/` 中无 `fetch(`/`XMLHttpRequest`/`sendBeacon` 调用；无 `localStorage`/`IndexedDB` 写入（仅注释与 UI 文案）；无 `dangerouslySetInnerHTML`/`innerHTML`；`src/` 中无 `node:crypto` import（仅注释提及）。
- e2e 实证：离线（全部远程请求被阻断）后 TFK-A 仍可分析，零远程请求；`<script>` 单元格内容被解析层拒绝（INVALID_RAGGED_GRID），无 dialog/pageerror；`<img>` 外链零请求且以文本渲染；清空后内存与 DOM 均无原值。
- `styles.css`/`main.tsx`/`index.html`/`vite.config.ts` 中无任何远程字体/样式/脚本引用。

## 7. 遗留 P2 逐项裁决（全部：可延期，非阻断）

| 项 | 本审查者核实 | 裁决 |
|---|---|---|
| J1（异形非法标记归入 INVALID_RAGGED_GRID） | `parse.ts` 确如此实现；冻结枚举只有 7 码，无 INVALID_HTML；每条错误消息正文写明真实原因（如“element \<div\> is not in the limited table subset”）。fail-closed，未违反规格明文 | **可延期（P2）** |
| J-T004-1（末尾换行） | `flatten.ts` 每行以 LF 终止（含末行）；Oracle 相同；规格文件自身的 §6.3 块按此口径哈希一致；`compare.ts` 把缺 LF 算作 EXACT_DIFF，口径全链一致 | **可延期（P2）** |
| J-T005-7（REPEAT_VALUE 选 rowspan c00） | 已独立复现（§5.1）；冻结 §3.3 + 选择顺序的必然结果，Oracle 逐字节一致 | **可延期（P2）**，终审应知此 quirk（见 §4.1） |
| O6（alternativeHtml 序列化未钉死） | 交叉核对只比对重解析后的 graph，不比对原始字符串；本轮 48+200 用例原始字符串差异为 0；结构保证成立 | **可延期（P2）** |
| J-T007-1（空串算未提供） | `compare.ts` 确如此；空文本区 = 什么都没粘贴，与 undefined 同义；仅含空白的串仍算已提供。规格未明文，解读合理 | **可延期（P2）** |
| J-T007-4（列数不一严于 GFM） | `detectGfmPipeTable` 要求各行列数一致；GFM 本身允许缺格行。但这只是 `gfm` 诊断字段，从不影响 EXACT_MATCH/EXACT_DIFF 的字节 verdict | **可延期（P2）** |
| J-T008-1（witness='UNSUPPORTED' 不可达） | `report.ts` 确如此：无效输入在组装结果前已抛错；但 UI 的 phase 仍按错误码映射出 UNSUPPORTED 状态，§4.2 的状态在产品层面可达 | **可延期（P2）** |
| J-T008-4（SHARED_SOURCE_CELL 未发出） | 字面标注确实未进入任何输出；但冻结 `SlotFact`（§6.1）无此字段、`§5.4` 行格式无此位置，逐槽事实 + 共享 cellId 已完整表达信息（G25 实证）。§3.3 的“标注”与冻结类型/格式小冲突，实现取冻结类型合理；如需该字面标签应走规格勘误，不应在本版改代码 | **可延期（P2）** |
| L2（analyze 内部哈希复核同一实现算两遍） | `report.ts` 确如此；只能捕获装配错误。真正的独立性由 TS↔Oracle 交叉核对提供且已成立 | **可延期（P2）** |
| L3（NO_WITNESS_FOUND 时 UI 再调一次 findWitness） | `App.tsx` 确如此；同一纯函数、同一输入，只取 `reason`，无正确性影响；仅在无见证路径上多一次见证搜索 | **可延期（P2）** |
| ISSUE-T013-1（515.9ms 离群一次） | 本轮隔离 p95 309.6ms；9 组隔离测量全部 ≤500ms，仅该一次超标，且该次 p50 同步翻倍、当日负载 3.87，环境离群证据成立 | **可延期（P2）** |
| ISSUE-T013-2（/tmp 满致 ENOSPC） | 环境问题（512M tmpfs）；本轮 /tmp 用 56%（229M 空闲），未复现；verify 的临时目录是风险点，不是产品行为 | **可延期（P2）** |
| ISSUE-T013-3（WINDOWS_NOT_TESTED） | 属实：全部验收均在 Linux x64；各处均诚实标注未测，未声称 Windows 支持 | **可延期（P2）**，记录在案 |
| ISSUE-T013-5（packaged_from_head） | 见 §8：实质已闭合，残留一句注释口径问题，记为新 P2 ISSUE-T014-1 | **已闭合（实质）+ 新 P2 记录项** |
| ISSUE-T013-6（verify 脆弱性） | 本审查者亲自复核：两日志文件写脏、不恢复，直接跑 verify，**真实退出码 0，RESULT: PASS（20/20）** | **已闭合** |

## 8. T013-FIX-01 闭合声明复核

### ISSUE-T013-6（verify 脆弱性）：已闭合，复核通过

`scripts/verify_release.mjs` 的 `VOLATILE_RUN_OUTPUTS` 只把两个易变文件排除出“清单哈希与工作树一致”这一项检查；清单/ZIP/HEAD 三方比对不受影响（代码已精读，注释与实现一致）。本审查者亲自验证：跑完 `test:e2e` + `test:e2e:perf` 后两文件均写脏、不恢复，直接 `npm run verify:release`，真实退出码 0，RESULT: PASS。修复得证。

### ISSUE-T013-5（packaged_from_head）：实质已闭合，残留 P2 记录项 ISSUE-T014-1

本审查者用 git blob 逐文件比对（174 文件）：

- ZIP 内容 vs **f53cef4（冻结发布提交）**：**174/174 一致**；
- ZIP 内容 vs **fb88a25（HEAD）**：**174/174 一致**；
- ZIP 内容 vs **c1af873（`packaged_from_head` 所指）**：**172/174 一致**；不一致的 2 个是 `review/REVIEW_INDEX.md` 与 `review/REVIEW_PACK_05.md`——正是打包时机械重生成的两个审查文件（PACK_05 嵌入修好的 verify 脚本全文，INDEX 列其哈希），随后在 f53cef4 中提交。

也就是说：`packaged_from_head` 的值 c1af873 是**生成清单与 ZIP 时的 HEAD**（清单注释的首要定义，与事实相符）；但清单注释的另一句——“源码 ZIP 内容与 packaged_from_head 的树逐文件核对（npm run verify:release 检查 a）”——并不准确：verify 的检查 (a) 实际比对的是 ZIP 与 git HEAD（fb88a25），不是与 c1af873；且 ZIP 与 c1af873 的树确有 2 文件之差。FIX-01 交接中“verified by git rev-parse”的说法也不构成树比对（rev-parse 只取提交号）。

为什么这不是阻断：2 文件之差是单遍打包流程的结构性必然（这两个文件必须在修好脚本后重生成、且它们就在 ZIP 里），不是未解释的漂移；ZIP 的真实树（f53cef4）已由两种独立方法验证 174/174（本审查的 git blob 比对 + verify 的 git archive 比对）；冻结提交 f53cef4 在清单注释与 FIX-01 交接中均有明确记录。建议：下次重打时把注释改成“`packaged_from_head` 为打包时 HEAD；ZIP 内容等于该树 + 打包时重生成的审查文件，等于冻结提交 f53cef4 的树”，或直接写明 172/174 的构成。终审消息草稿（另附）已直接写明真实数字，以免 GPT 按字面去比对 c1af873 时误判。

**ISSUE-T014-1（新增，P2，非阻断）：** 清单 `packaged_from_head` 注释口径不精确（见上）。无内容错误，无缺失文件，不阻断终审。

## 9. 结论

**READY_FOR_FINAL_REVIEW。**

- 核心数学（A≠B、F(A)=F(B)、两种策略、标题路径、失败语义）经本审查者独立重算与双向核对成立；
- 全部验收命令真实退出码均为 0（test:core 719/719、oracle 48/48、verify:release 20/20、e2e 20/20、隔离 p95 309.6ms ≤500ms、typecheck/build 0、CLI TFK-A 0）；
- 发布包字节数与 SHA 与清单一致，174 文件逐文件 SHA 与冻结提交一致（抽查 22/22，verify 全量 174/174）；
- 遗留项逐项裁决均为 P2 可延期；T013-FIX-01 的两项闭合声明经复核：ISSUE-T013-6 得证，ISSUE-T013-5 实质闭合、残留一句注释口径问题（ISSUE-T014-1，P2）；
- 未发现任何 P0/P1，未列入 REVIEW_BLOCKED。

终审 R1 消息草稿见 `review/FINAL_REVIEW_R1_MESSAGE_DRAFT.md`（只写草稿，绝不发送；终审提交须主聊天确认后才发）。

## 10. 可由 ChatGPT 直接读取的入口与证据清单（按 §12）

**Drive 归档已完成（2026-11-21 ~05:20 UTC，协调员亲做，34/34 文件 size+MD5 核实通过）。** 归档根文件夹 `agent project auto/P029-tablefork/`（https://drive.google.com/drive/folders/1_sqMEKpcMEMXfOBxK5PJwvAp6MHlnNTD）；发布包 `05_release_FIX_T013FIX01_f53cef4`（https://drive.google.com/drive/folders/1BNXivVvfyzrJjo0tKad9g-caX3EfiVKY）、审查 `04_review_FIX_T013FIX01_f53cef4`（https://drive.google.com/drive/folders/1jAHjk5ZV1WXsDjezA-OfVwicKOto4G8O）、证据 `03_evidence_FIX_T013FIX01_f53cef4`（https://drive.google.com/drive/folders/1nIgpqLumoox9mW-NgVF7aocnMJEu2ptw）。ChatGPT 读不到的文件须写明“仅见文件名/链接”，不得视为覆盖。

### 10.1 规格（四份实体 + 构思报告；Drive 已有 v1.0.1 归档，见 S0 报告）

- `PROJECT_BOOK.md` v1.0.1（https://drive.google.com/file/d/1NBXXTR9yy4942lHUjrrLxz4xvVCX1Rzr/view）、`PROJECT_BOOK.docx` v1.0.1（https://drive.google.com/file/d/1GOveEEjfpFxzv3ku-xQwy8lEPacgkgkp/view）
- `IMPLEMENTATION_PLAN.md` v1.0.1（https://drive.google.com/file/d/1LLs5KGh8Ij4gQOiS59gbR091bbZLQjlr/view）、`IMPLEMENTATION_PLAN.docx` v1.0.1（https://drive.google.com/file/d/1BgnAoJYTVirmjs4KKI04DagRjnsALd7C/view）
- `P029_IDEATION_REPORT.md`（见 Drive `00_ideation/` 文件夹：https://drive.google.com/drive/folders/181ojfOxMHBYXN3CkOpNdIPI8eANj4GNV）
- 本地路径：`bundle/`（5 文件，SPEC_MANIFEST.json SHA 全对，见 S0 报告）；工作区副本：`docs/`；Drive 规格 bundle：`P029_SPEC_BUNDLE.zip`（https://drive.google.com/file/d/1AzHZJJ-tiQFP-aN1VCeYD-NqCLpcMeMP/view）

### 10.2 终审源码索引与分卷（已归档：`04_review_FIX_T013FIX01_f53cef4`）

- `review/REVIEW_INDEX.md`（49 代码文件 + 125 非代码清单文件，分卷表 SHA 与实测一致；https://drive.google.com/file/d/1ZWLdQ5XNfKvcM4tVXIqyH1w0fkrVP8b4/view）
- `review/REVIEW_PACK_01.md`（11 文件，105,831 B，SHA `4c671f5f…2e947`；https://drive.google.com/file/d/1Fp0NxPlWejPZUPIcCv1gj7UqRjC5XYII/view）
- `review/REVIEW_PACK_02.md`（15 文件，84,136 B，SHA `760bf652…65f`；https://drive.google.com/file/d/1vg8y-VDxYvl8ISyTexgfGCuHwbgBhQ-M/view）
- `review/REVIEW_PACK_03.md`（9 文件，106,356 B，SHA `25471703…12b5`；https://drive.google.com/file/d/1Qi_k_sGxgTmHi-45tAmj5PGXYGzqcVeL/view）
- `review/REVIEW_PACK_04.md`（7 文件，55,262 B，SHA `bbc0fde0…2e1e`；https://drive.google.com/file/d/1I1HGcPTdSu8eblH32MdizC1itpMB-fDf/view）
- `review/REVIEW_PACK_05.md`（7 文件，78,104 B，SHA `cbbf3f07…93`；https://drive.google.com/file/d/1i3ZFS3JUgSe2Xnnhwf8p-uA3pfu56xwR/view）
- `review/SCREENSHOT_INDEX.md`（13 张截图映射；https://drive.google.com/file/d/1Zlpc4dI6KgL1AKm0zeR4s2rGiN8TAEiF/view）
- `review/INDEPENDENT_REVIEW.md`（本文件；https://drive.google.com/file/d/1ABkZ-cADIM03MNPDPekxxc4BtkZgdkiC/view）
- `review/FINAL_REVIEW_R1_MESSAGE_DRAFT.md`（终审 R1 草稿，不发送；https://drive.google.com/file/d/1gOIZa52J62n6nIAJE8uFfNe9DfV8RzOJ/view）

### 10.3 关键配置（未单独上传 Drive，均在源码 ZIP 内，见 §10.6；清单 174 文件含其 SHA）

- `package.json`（9 条 scripts，与计划 §2.3 一致）、`package-lock.json`（SHA `80a86c95…7974f`）
- `tsconfig.json`、`vite.config.ts`、`playwright.config.ts`（functional + perf 两个项目）

### 10.4 真实测试与截图（已归档：`03_evidence_FIX_T013FIX01_f53cef4`）

- `npm run test:core` 719/719；`npm run oracle` 48/48；`npm run test:e2e` 20/20；`npm run test:e2e:perf` p95 309.6ms（n=30）
- `artifacts/logs/T014-review.txt`（本审查全部复测记录；https://drive.google.com/file/d/1B9MkzPWRgSzwBnI3itc5C7sp39nWMbdM/view）、`artifacts/logs/T013-release.txt`（https://drive.google.com/file/d/1FBzPljj8IGujbzW5oqj6V8Pe9E_9i1VJ/view）、`artifacts/logs/T013-FIX-01.txt`（https://drive.google.com/file/d/1gUsVCCdpMZvt8UZvQfE9HWRGN9-g-NDE/view）
- `artifacts/screenshots/` 13 张真实 Chromium 截图（TFK-A/B/C/D、390px、键盘焦点、性能失败瞬间两张；证据文件夹：https://drive.google.com/drive/folders/1nIgpqLumoox9mW-NgVF7aocnMJEu2ptw）
- `T012-performance.json`（六组性能数据集；https://drive.google.com/file/d/1nZ_0QYWhXvpO9B5tjOig77rAaBQBah5O/view）

### 10.5 独立预审 / 修复闭环（本文件已归档；交接 JSON 在 git 仓库内，未上传 Drive）

- 本文件（T014 独立审查，READY_FOR_FINAL_REVIEW；P2 裁决 15 项 + 新 P2 ISSUE-T014-1）
- `task_handoffs/P029-T013-FIX-01.json`（ISSUE-T013-5/6 修复；本审查复核：T013-6 得证，T013-5 实质闭合 + 注释口径 P2）
- `task_handoffs/P029-T014.json`（本卡交接，提交 2）

### 10.6 发布包（已归档：`05_release_FIX_T013FIX01_f53cef4`）

- 源码 ZIP：`artifacts/release/tablefork-source-4025061.zip`，**3,641,833 B**，SHA-256 `5ca6aec629adc562fa7f0e13bdcff0e6e0d9a1e85a222615666cad828c630693`（https://drive.google.com/file/d/1rkQyS4THDVO5PbbMYNd6eJr6oRl3Cna0/view）
- 构建 ZIP：`artifacts/release/tablefork-dist-4025061.zip`，**98,684 B**，SHA-256 `af8f43a9af25baeb4a3d51a34c0eb76e6b926faeca7d9b587f7367e4eb7044b1`（https://drive.google.com/file/d/1G9MGX8PqJlzMNHpIafVTwKIB6kY6wUOU/view）
- 清单：`review/RELEASE_MANIFEST.json`，174 文件（https://drive.google.com/file/d/1uGrrrTl--U9JmCQ8t6iQcQcEt3nUBwGU/view）；`packaged_from_head` c1af873（生成时 HEAD；ZIP 内容 = 冻结提交 f53cef4 的树，174/174，见 §8）；冻结发布提交 f53cef4；终审交接提交 e058ffb
- `scripts/verify_release.mjs`（20 项检查，RESULT: PASS）
