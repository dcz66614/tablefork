# P029 TableFork — 独立审查报告（P029-T015，R2 前审查）

- 审查者：独立审查员（任务卡 P029-T015）。未参与 T001–T014、FIX-01–FIX-04、REFREEZE、REFREEZE-NOTES-FIX 的任何构建/冻结/打包工作；本次审查为全新会话，未复用他人的运行日志作为证据——下述每条命令均为本审查者亲自运行、每个哈希均为本审查者亲自重算。
- 审查对象：冻结提交 `476dd637cb157e25b611c5a9f6ecd145720b9978`（REFREEZE-NOTES-FIX，消息 "P029-REFREEZE-FIX: correct manifest notes wording (packaged_from_head vs freeze commit), spec v1.0.2"），交接提交 `8bdd1f9957f802d1aee4d117f467b673974b06db`。工作基线 base_commit `6c81860`（FIX-04 交接提交）→ 脚本修正提交 E1 `5b3753002053c371bc7b269f9b02665e60f0b919` → 冻结提交 E2 `476dd63` → 交接提交 E3 `8bdd1f9`。
- 审查时间：2026-11-21 ~12:05–12:20 GMT。环境：本 VM，Node v24.22.1，Playwright Chromium 159.0.8154.6。全部验收命令均以 `TMPDIR=~/workspace/p029-tmpdir`（仓库外持久磁盘）运行；跑完后临时目录已删除；e2e 写脏的两个易变日志（`artifacts/logs/T012-cancel-probe.json`、`T012-perf-browser.json`）已 `git checkout` 恢复；审查结束时 `git status` 仅剩任务前已存在的 3 个未跟踪项（`COORDINATOR_LOG.md`、`S0_REPORT.md`、`test-results/`），无业务文件改动。
- 结论见 §9：**READY_FOR_FINAL_REVIEW**。两项 R1 P1 均已关闭；未发现新的 P0/P1；新发现 4 项 P2 记录问题（§8），均非阻断。

## 1. 已读材料

- 规格（`bundle/` 下 v1.0.2 核对版）：`PROJECT_BOOK.md`（33528 B）与 `IMPLEMENTATION_PLAN.md` 全文、`SPEC_MANIFEST.json`（spec_version 1.0.2）；DOCX 抽查：`PROJECT_BOOK.docx` 内含 `inputHash` 6 处、`1.0.2` 4 处，`IMPLEMENTATION_PLAN.docx` 内含 `1.0.2` 7 处——勘误已同步进 DOCX。
- R1 回复全文 `~/workspace/P029_FINAL_REVIEW_R1.md`（13,021 B）：两项 P1 的原文与复现步骤已逐字核对（见 §2）。
- 冻结源码精读：`src/ui/App.tsx`（全文）、`src/core/types.ts`、`src/core/report.ts`、`src/ui/InputPanel.tsx`、`src/ui/ExportPanel.tsx`、`src/worker/tablefork.worker.ts`、`src/core/parse.ts`（`normalizeCellText`）、`cli/analyze.ts`、`oracle/reference.py`（`analyse()` 与 `SPEC_VERSION`）、`scripts/verify_release.mjs`（`buildManifestNotes` 与检查 (a)–(d)）、`tests/e2e/tablefork.e2e.ts`（两项 P1-01 回归测试与导出测试）、`tests/core/report.test.ts`、`tests/core/golden.test.ts`、`oracle/golden_expected.json`。
- 修复与重冻结日志（仅作线索，不作证据）：`artifacts/logs/FIX-01.txt`、`FIX-02.txt`、`FIX-03.txt`、`FIX-04.txt`、`REFREEZE-FIXR1.txt`、`REFREEZE-NOTES-FIX.txt`、`task_handoffs/P029-REFREEZE.json`、`task_handoffs/P029-REFREEZE-NOTES-FIX.json`、T014 审查报告 `review/INDEPENDENT_REVIEW.md`（§7–§8 的 P2 清单）。

## 2. R1 两项 P1 的原文核对

- P1-01（在途任务失效）：R1 指 `App.tsx` 的 `resetResult()` 只清 outcome/error/selectedSlot、不清 pendingRef、不递增 jobSeqRef；四条输入变化路径只调 `resetResult()`；Worker 回调只比 jobId/seq、不比当前输入与任务快照；`InputPanel` 在 ANALYZING 时仍可编辑。复现：32×12 性能表运行中切换到 TFK-C、不启动第二次分析，旧结果仍显示并可导出。
- P1-02（证据 JSON 缺 §9 字段）：R1 指 `AnalyzeResult` 无 jobId/inputHash/specVersion；`report.ts` 不生成；`ExportPanel` 直接 `JSON.stringify(result)`；`SPEC_VERSION` 常量已定义为 1.0.1 但未进入导出；§9（"所有报告具 jobId + inputHash + specVersion"）与 §6.1 类型定义冲突，裁决 §9 优先，规格升 v1.0.2。

## 3. 独立复测：命令与退出码

| # | 命令（本审查者亲自运行） | 结果 |
|---|---|---|
| 1 | `npm run typecheck` | exit 0 |
| 2 | `npm run test:core` | exit 0，**745/745**（11 文件，含 property crosscheck 205） |
| 3 | `npm run oracle` | exit 0，**49/49**（G01–G49） |
| 4 | `npm run test:e2e` | exit 0，**22 passed**（含两项 P1-01 回归测试，见 §4） |
| 5 | `npm run test:e2e:perf` | exit 0，1 passed；p95 **314.8ms**（见 §7） |
| 6 | `npm run build` | exit 0（vite 2.07s） |
| 7 | `npm run verify:release` | exit 0，**RESULT: PASS（0 failing）**；1 条 WARN（工作区 4 个打包后入树文件不在清单内，见 §6） |
| 8 | `npm run analyze -- --input fixtures/TFK-A.json --out /tmp/t015-tfka-report.json` | exit 0，CERTIFIED_COLLISION（见 §5） |
| 9 | 同上，策略改为 REPEAT_VALUE | exit 0（见 §5） |
| 10 | 篡改实验（见 §6.3）：scratch 克隆 verify 基线 → 改模板一词 → verify → 恢复 → verify | PASS → **FAIL（exit 1）** → PASS |

## 4. P1-01：CLOSED（独立判断）

源码核实（`src/ui/App.tsx` 全文精读，非只读日志）：

- `invalidateInFlight()`（FIX-01 新增）：有在途任务时向 Worker 发 CANCEL、清 `pendingRef`、递增 `jobSeqRef`、清 analyzing/jobId；无在途任务时为 no-op。`resetResult()` 先调它，再清 outcome/error/selectedSlot。
- 四条 R1 所指路径**全部**经 `resetResult()` 覆盖：`onHtmlChange`、`onMarkdownChange`、`onStrategyChange`、`onSelectPreset`；另有第五条路径 `onFillCanonical`（"用 F(A) 填入"）同样经 `resetResult()`。无遗漏路径。
- Worker 回调三层守卫：(1) `seq !== jobSeqRef.current` 丢弃；(2) `pending === null || pending.seq !== seq` 丢弃；(3) FIX-01 (b) 快照比对——`pending.html/markdown/strategy` 与 `inputsRef.current` 有任一不等即丢弃并清 analyzing。纵深防御成立。
- `InputPanel` 在 ANALYZING 时**仍可编辑**（textarea 无 disabled）——这是有意的设计而非遗漏：任何一次编辑都会触发 `invalidateInFlight()`，旧任务当即失效，不可能再显示。R1 的"仍可编辑"只有在"编辑不使旧任务失效"的前提下才是缺陷；该前提已被修复消除。GPT 在 R2 不应仅凭"可编辑"重提此项；若重提，应以本节的机制 + 下述 E2E 实测回应。

实测（本审查者亲自跑，非读日志）：

- `npm run test:e2e` 22/22 通过，其中两项 FIX-01 新增回归测试均通过：
  - `stale result: switching preset mid-analysis never shows the old result (P1-01)`——与 R1 复现步骤逐字对应：32×12 性能表填入后，比较点击与 TFK-C 切换在同一 JS 任务内同步发出，等 5 秒后页面无任何结果（无见证、无双表、无交接稿/JSON、下载 JSON 按钮 disabled），随后一次全新分析正常出 NO_WITNESS_FOUND。
  - `stale result: switching strategy mid-analysis never shows the old result (P1-01)`——策略切 REPEAT_VALUE 路径，同样无旧结果，随后全新分析正常出结果。
- `cancel/race` 测试亦通过；取消探测实测写回的 `T012-cancel-probe.json` 显示 3 次尝试均在任务完成前观察到并点按了"取消"按钮（clicked=true，76/49/17ms），取消按钮真实可达。

**P1-01 判定：CLOSED。** 机制（失效 + 三层回调守卫）与确定性 E2E 复现双重成立。

## 5. P1-02：CLOSED（独立判断）

源码核实：

- `src/core/types.ts`：`AnalyzeResult` 已含 `jobId: string; inputHash: string; specVersion: string` 三个必填字段；`SPEC_VERSION = '1.0.2'`。
- `src/core/report.ts`：`analyze(input, jobId)`——jobId 为必填第二参数，空串即抛错（fail-closed）；结果组装时 `jobId` 原样填入，`inputHash = sha256Sync(input.html)`（与 witness proof 同一同步实现 `src/core/sha256.ts`），`specVersion = SPEC_VERSION`。
- `src/worker/tablefork.worker.ts`：RESULT 的 `data` 由 `analyze(payload, jobId)` 产出，外层 jobId 与内层 `data.jobId` 一致；`src/ui/ExportPanel.tsx` 的 `downloadJson` 仍是 `JSON.stringify(result)`——现在 result 本身已含三字段，无需再补，链路完整。
- `cli/analyze.ts`：jobId 传 `cli-<fixture_id>`（确定性）；`oracle/reference.py`：`analyse()` 返回 `inputHash`（输入 HTML 的 SHA-256）与 `spec_version = "1.0.2"`，jobId 仅在调用方传入时回显、不臆造。
- 规格：`PROJECT_BOOK.md` 封面勘误注 v1.0.2 第 (1)–(3) 条——§6.1 补三字段、§6.2 签名改为 `analyze(input, jobId)`、§9 补 `inputHash` 定义（输入 HTML 原文的 SHA-256，UTF-8 字节，十六进制小写）；§6.1 与 §9 已无冲突。`IMPLEMENTATION_PLAN.md` 勘误注同步。

独立重算（本审查者亲自跑，非读日志）：

- CLI TFK-A（ORIGIN_EMPTY）：exit 0，`jobId: cli-TFK-A`，`inputHash: 2ebbbde88fa65509a6aac5e8c74884c56361f9442a7b4527fdf6fcdc7a9c0341`（本审查者用 Python `hashlib.sha256` 对 fixture 的 HTML 原文独立重算，结果**逐字节一致**），`specVersion: 1.0.2`，witness CERTIFIED_COLLISION。
- §6.3 示例五组哈希（与 R1 ACCEPTANCE_EVIDENCE 逐项比对，**全部一致**）：
  - aGraph: `dbd4b9cebec9a13f40cfdff378c78d1f59325cdc0e721faa0b4068eb90de157d`
  - bGraph ORIGIN_EMPTY: `a9ec182caf420715248a255286d2daef973a8e22719691db813dd05d88238bc5`
  - bGraph REPEAT_VALUE: `ba552bb47172087248e45ce9ad5d71a8c5a4435719c1faac360be665c17e1bd1`
  - Markdown ORIGIN_EMPTY: `83da510440918640ba87eff47fa11cad70444955f6ce7e36724e4d26765338c1`
  - Markdown REPEAT_VALUE: `e97edc1bda41731291466e2a64d0338df9abcf7b30f947ce1768592eba0bdffb`
- canonicalMarkdown 与 §6.3 展示值逐字节一致（含末行 LF）。
- Golden：`oracle/golden_expected.json` 共 49 条、`spec_version: 1.0.2`；41 条有效 fixture 的 expected 均含 `inputHash`，8 条错误 fixture 只含 `error`（无结果可言，正确）；G49 为最后一条。`tests/core/golden.test.ts` 逐条断言 `result.inputHash` 等于手算预期且等于独立重算；`tests/core/report.test.ts` 的 FIX-02 专节断言三字段齐全与 jobId 隔离性。`npm run oracle` 49/49、`test:core` 745/745 均已亲自跑通。

**P1-02 判定：CLOSED。** 类型、内核、Worker、CLI、Oracle、导出链路、规格五方一致；三字段已贯穿到导出 JSON。

## 6. 冻结身份与清单 notes 核实

### 6.1 ZIP 与清单（本审查者亲自重算）

- source ZIP `artifacts/release/tablefork-source-6c81860.zip`：**3,741,576 B**，SHA-256 **`d7b38e5554a292d0e2bd065184920077c44f250c9f2bf6b41e649ce70e69f497`**——与任务书给定值一致。
- dist ZIP `artifacts/release/tablefork-dist-6c81860.zip`：**98,874 B**，SHA-256 **`e0a2ce5e39e69981d7cdec406cd7c1e0a7585bd20eaef18e16f58473c89d5602`**——与任务书给定值一致；verify 的 (b) 项证实其与全新构建逐字节一致（4 个条目：`index.html` + 3 个 assets）。
- `review/RELEASE_MANIFEST.json`：**192 文件**，`spec_version: 1.0.2`，`base_commit: 6c81860`，`packaged_from_head: 5b3753002053c371bc7b269f9b02665e60f0b919`，`packaged_at_utc: 2026-11-21T11:56:52.589Z`。
- 本审查者用自写脚本逐项比对（非只信 verify）：ZIP 条目集合 == 清单 192 文件集合；ZIP 内 192 文件逐文件 SHA-256 与清单**零不符**。

### 6.2 ZIP 与冻结提交的等式（本审查者亲自用 `git archive` 比对）

| 比对对象 | 结果 |
|---|---|
| ZIP vs 冻结提交 E2 `476dd63` 的树 | 清单 192 文件**零差异、零缺失**；树上多出的文件恰为自指排除集：清单自身、2 个发布 ZIP、3 个日志（`T013-release.txt`、`REFREEZE-FIXR1.txt`、`REFREEZE-NOTES-FIX.txt`）、旧交接 JSON `task_handoffs/P029-REFREEZE.json`（见 §8 P2-T015-3） |
| ZIP vs `packaged_from_head` E1 `5b37530` 的树 | 仅 **2 文件**不同，正是 notes 所列的机械重生成文件：`review/REVIEW_INDEX.md` 与 `review/REVIEW_PACK_05.md`——notes 等式"ZIP 内容 = packaged_from_head 的树 + 2 个机械重生成文件"**逐文件成立** |
| ZIP vs 交接提交 E3 `8bdd1f9` 的树 | 清单 192 文件零差异（E3 只比 E2 多一个交接 JSON） |

- `npm run verify:release` 亲自跑出 **RESULT: PASS（0 failing）**，含检查 (a) fresh git archive HEAD 与 ZIP 内容 192/192 一致。唯一 WARN：工作区 4 个打包后入树文件不在清单内（`REFREEZE-FIXR1.txt`、`REFREEZE-NOTES-FIX.txt`、`P029-REFREEZE.json`、`P029-REFREEZE-NOTES-FIX.json`）——按脚本设计只警告、不失败（文件头已写明"此后新增文件只警告、不失败"），与 REFREEZE 轮次的 1 条 WARN 同类，属预期行为。

### 6.3 notes 措辞核实与"只改 notes 不重打"纠正的独立验证

- 新 notes 全文已逐字核对：无"冻结提交 b7e1023"式误标（notes 内不再插值任何提交哈希称其为冻结提交；冻结提交只由 `task_handoffs/P029-REFREEZE-NOTES-FIX.json` 的 `result_commit` 指明，该文件 `result_commit` 确为 `476dd637cb157e25b611c5a9f6ecd145720b9978`）；无"（0 个文件）"式表述；base_commit（6c81860 = FIX-04 handoff 提交）与 packaged_from_head（5b37530 = 生成清单与 ZIP 时的 HEAD，即脚本修正提交 E1）的定义与实例数字一致；"本清单由 P029-REFREEZE-NOTES-FIX 从修复提交重新生成"属实。
- 本审查者直接调用 `buildManifestNotes()` 复核：2 文件分支的输出与清单 notes **逐字节相等**；0 文件分支输出为干净句子"打包时无机械重生成文件"，不含"0 个文件"。
- 纠正验证（**实证**，非推理）：在 scratch 克隆（`file://` 克隆 + symlink 的 node_modules）中先跑 verify 得基线 PASS；随后**只改模板一词**（`buildManifestNotes` 内"打包时无机械重生成文件"→"打包时没有机械重生成文件"，清单与 ZIP 均不动）再跑 verify，结果 **RESULT: FAIL（exit 1）**——`[FAIL] manifest file hashes match worktree — 189/190 OK; bad: scripts/verify_release.mjs`。恢复后重跑恢复 PASS。结论：**执行员的纠正成立**——`scripts/verify_release.mjs` 本身在清单 192 文件内、在 source ZIP 内、全文嵌在 REVIEW_PACK_05.md 内、SHA 列在 REVIEW_INDEX.md 第 31 行；改模板一字即改其字节，只改 notes 不重打 ZIP，verify 确实 FAIL。因此 source ZIP 必须重打、packaged_from_head 改为 E1、INDEX + PACK_05 联动，执行员的做法正确。任务书前提"只改 notes、ZIP 不变"是错的，已纠正。
- 附：PACK_05 嵌入的脚本确为新版（grep 到新 SHA `5e2a2a9f…` 1 处）；REVIEW_INDEX.md 第 31 行记录脚本 SHA `5e2a2a9f835be8e228935bd2ec6c94940b3f47bfa32cd69968c7f34008d6bd4e`、685 行，与清单一致。
- R1 遗留哈希笔误：R1 正文曾误写旧冻结 ZIP 哈希（缺 "15"，`…222666cad…`；正确 `…222615666cad…`）——该哈希是**旧冻结 ca8bed6** 的 ZIP，与本次无关；旧哈希只出现在 T014 审查报告 §10.6 与 R1 消息草稿等历史记录中，新清单/ZIP 中无此问题；本次新哈希 `d7b38e55…` 已亲自重算无误。
- REVIEW_PACK_03 Drive 链接问题：R1 时 GPT 称链接与实际文件 id 不一致，主聊天已核对一致。本次审查核实本地 5 个 PACK 文件与清单/ZIP 一致（见 §6.4）；Drive 链接由归档卡另行逐个复核，不属本审查范围。

### 6.4 REVIEW_PACK 抽查（本审查者亲自重算，非只信 verify）

- 自写解析脚本重解析 5 个 PACK 的全部 **50 个代码块**：逐块取声明 SHA，与磁盘文件 SHA、清单 SHA 三方比对。48 个文件以"内容 + 末尾换行"吻合；`package.json` 与 `tsconfig.json` 磁盘上无末尾换行，其块内容（无末尾换行）哈希亦与声明 SHA、磁盘 SHA、清单 SHA 三方一致。**50/50 全部一致**（verify 检查 (d) 的 50/50 亦亲自跑出 PASS，互为印证）。另抽查：`src/ui/App.tsx`、`src/core/report.ts`、`oracle/reference.py` 三个关键文件均在其中且一致。

## 7. 性能（p95）与判断

- 本审查者亲自跑 `npm run test:e2e:perf`：**exit 0，1 passed**。实测 `artifacts/logs/T012-perf-browser.json`（跑后已恢复）：n=30，min 176ms，**p50 216.2ms，p95 314.8ms**，max 377.6ms，目标 ≤500ms，pass=true。运行期间本 VM 负载 load average 3.85→3.67（1.5 共享 vCPU，负载高于 REFREEZE 克隆机当时的 2.85），仍有 185ms 裕量。
- 判断：**产品无退化，属共享 VM 测量噪声**。证据链：(1) 本轮高负载下 p95 314.8ms，与主仓对照值 323–325ms、克隆机第三次 317.2ms 同分布；(2) REFREEZE 轮次两次超标仅 509.4/513.8ms（超阈值 2–3%），且当时 p50 同步上移（322 vs 223ms），符合负载整体上移而非单点回归；(3) 冻结代码与 dist 逐字节一致（verify (b)），无任何性能相关改动介于其间。建议终审消息中注明该测量在共享 VM 上有负载波动，p95 阈值附近的单次结果不作回归定论。

## 8. 其余携带 P2 的评估与本轮新发现

### 8.1 T014 携带的 P2（逐项复核，全部仍为非阻断）

T014 §7 的 15 项逐项核对：J1、J-T004-1、J-T005-7、O6、J-T007-1、J-T007-4、J-T008-1、J-T008-4、L2、L3、ISSUE-T013-1/2/3、ISSUE-T014-1、ISSUE-T013-5/6——其中 ISSUE-T013-6（verify 脆弱性）与 ISSUE-T013-5（packaged_from_head 实质）已于 T014 闭合；ISSUE-T014-1（清单注释口径）**已被本轮 REFREEZE-NOTES-FIX 实质解决**（新 notes 经 §6.3 核实措辞准确，等式逐文件成立）。其余各项本轮无新证据改变其 P2 定性：

- R1 P2 #3 的 NBSP 差异已由 FIX-03 关闭（`normalizeCellText` 改为 ASCII-only 字符集 `[ \t\n\f\r\v]`，保留 U+00A0；新增独立 Golden G49；`npm run oracle` 49/49 与 `nbsp.test.ts` 13 测试均亲自跑通）。
- R1 P2 #3 余项（命名实体集、DOCTYPE、隐式/显式 tbody 差异）仍为已知差异，无新证据升级。
- FIX-04 的 `\v` 对齐已核实：TS 折叠与 trim 字符集均已补 `\v`，与 Oracle 的 `[ \t\n\r\f\v]` / `.strip(" \t\n\r\f\v")` 一致；6 个新测试在 `test:core` 745/745 内通过。
- R1 P2 #4（Worker 取消非严格中断）、#5（caption 不参与网格）、#6（SHARED_SOURCE_CELL 未输出）、#7（严格 CSP 未设置）、#8（Windows/macOS 未实测）均无新证据，本轮仍判 P2 非阻断；Windows/macOS 未实测属实，终审不得宣称多平台通过。
- 截图：11 张重拍与 2 张保留的 T012-perf-fail 图未在本轮重拍（内容不受 FIX-01～04 影响）；SCREENSHOT_INDEX 未逐张重验，沿用 REFREEZE 的核对结论。

### 8.2 本轮新发现的 P2（非阻断）

- **P2-T015-1**：清单 `excluded_reason` 仍写"哈希见 task_handoffs/P029-REFREEZE.json"，但该文件记录的是**旧冻结**的 source ZIP 哈希（`3d023f3b…`，3,740,523 B），不是本次的 `d7b38e55…`。纯文档指针陈旧；权威值就在同一清单的 `source_zip`/`dist_zip` 字段内，无歧义。建议下次重打时把指针改为 `P029-REFREEZE-NOTES-FIX.json` 或删去。
- **P2-T015-2**：`scripts/verify_release.mjs` 文件头注释（约第 37 行）仍写"哈希见 task_handoffs/P029-T013.json"——T013 时代的文字，同样陈旧；不影响任何检查逻辑。
- **P2-T015-3**：notes 的排除枚举"清单自身、发布 ZIP、重冻结日志"未点名 `task_handoffs/P029-REFREEZE.json`；该旧交接 JSON 在冻结提交 E2 的树内但不在 ZIP 内（§6.2 的 git-archive 比对：树上多出 7 文件，notes 措辞覆盖其中 6 个）。"与冻结发布提交的树逐文件一致"一句按字面差 1 个文件。非阻断：交接 JSON 从不是任何发布包的成员，verify 对其只 WARN；建议下次模板修订时在排除措辞中加上"交接 JSON"。
- **P2-T015-4**：E2E 导出测试（`tablefork.e2e.ts:186`）只断言下载 JSON 的 schema/witness/compare/proof，未断言 jobId/inputHash/specVersion 三字段。三字段已有 `report.test.ts`、金测与 CLI 三重覆盖，故仅为测试加固建议，非缺口。
- **观察项（非问题）**：`InputPanel` 在 ANALYZING 时仍可编辑，属有意设计（见 §4）；GPT 若在 R2 仅凭"可编辑"重提 P1-01，应以失效机制 + E2E 实测回应。

## 9. 结论

**verdict: READY_FOR_FINAL_REVIEW。**

- P1-01 CLOSED：失效机制（`invalidateInFlight` + 三层回调守卫）覆盖 HTML/Markdown/策略/预设/F(A) 填入五条路径；GPT 复现步骤的确定性 E2E 回归测试亲自跑通，旧结果不显示、不可导出。
- P1-02 CLOSED：§6.1 与 §9 已无冲突；jobId/inputHash/specVersion 贯穿类型、内核、Worker、CLI、Oracle、导出 JSON；§6.3 五组哈希与 CLI 输出亲自重算，与 R1 一致；Golden 49/49。
- 冻结身份成立：source ZIP 3,741,576 B / `d7b38e55…`、dist ZIP 98,874 B / `e0a2ce5e…`、清单 192 文件、base 6c81860、packaged_from_head 5b37530…、spec 1.0.2；ZIP 与冻结提交 E2 的树逐文件一致，与 packaged_from_head 的树仅差 notes 所列 2 个机械重生成文件；notes 措辞准确；"只改 notes 不重打"的纠正经篡改实验实证成立。
- 全部验收命令亲自跑通（§3 表）；perf p95 314.8ms，噪声判断成立；携带 P2 与 4 项新 P2 均非阻断。
- 未发现任何 P0/P1。

## 10. Drive 链接（待归档填）

本审查为 R2 前的独立审查；Drive 归档由归档卡负责。本报告中的 Drive 链接占位符**待归档后填**——归档卡负责填入真实链接，0 占位符残留是归档卡的责任。本地证据入口：`review/RELEASE_MANIFEST.json`、`review/REVIEW_PACK_01.md`～`REVIEW_PACK_05.md`、`review/REVIEW_INDEX.md`、`artifacts/release/tablefork-source-6c81860.zip`、`artifacts/release/tablefork-dist-6c81860.zip`、`artifacts/logs/FIX-01.txt`～`FIX-04.txt`、`artifacts/logs/REFREEZE-NOTES-FIX.txt`、本文件 `review/INDEPENDENT_REVIEW_R2.md`。
