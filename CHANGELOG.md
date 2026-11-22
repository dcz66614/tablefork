# TableFork — 变更日志

> 首次发布 v1.0.0，对应冻结规格 v1.0.1（PROJECT_BOOK.md / IMPLEMENTATION_PLAN.md）。
> 本文件只记录已实现并已验收的版本；未来版本按同一门禁（终审 `FINAL_VERDICT: PASS`）发布。

## v1.0.0 — 2026-11-21（首次发布）

- 核心：单个 HTML 顶层 `<table>` 的严格解析、覆盖网格、明示标题路径
  （`src/core/parse.ts`、`grid.ts`、`headers.ts`）。
- 双策略 Markdown 投影：`ORIGIN_EMPTY` 与 `REPEAT_VALUE`
  （`src/core/flatten.ts`），转义与 LF 口径冻结。
- 单格拆分碰撞证明：`A ≠ B` 且 `F(A) = F(B)`，优先选标题路径改变的候选
  （`src/core/witness.ts`）；标题关联变化时打
  `HEADER_ASSOCIATION_CHANGED`，否则只说 `STRUCTURAL_COLLISION`。
- 用户 Markdown 严格 UTF-8 字节对账（`src/core/compare.ts`）：
  `EXACT_MATCH` / `EXACT_DIFF`（首个不同字节定位）/ `NOT_SUPPLIED`；
  `M ≠ F(A)` 时证书只对 `F(A)` 生效。
- 逐格交接稿与 `tablefork.report/v1` 报告（`src/core/records.ts`、
  `report.ts`）；未知标题写 `?`，绝不编造。
- 独立 Python Oracle（`oracle/reference.py`）：48/48 Golden 一致，
  200 个固定种子交叉核对无分歧。
- UI 工作台（`src/ui/*`）：双表同文 + 中央单份 Markdown、三屏状态、
  交接稿 / 证据 JSON、复制 / 下载 / 清空；分析走全项目唯一 Worker
  （`src/worker/tablefork.worker.ts`），主线程 jobId 采纳 + 取消按钮
  在真实浏览器里可达（ISSUE-T012-2 已闭合，3/3 次探测均点中取消）。
- CLI（`cli/analyze.ts`）：`npm run analyze -- --input fixtures/TFK-A.json`，
  与 UI 同一内核，同一结论。
- 四个合成预设 TFK-A / TFK-B / TFK-C / TFK-D（`fixtures/TFK-*.json`）。
- 测试：单元 + 属性 719/719；Golden 48/48；E2E 功能 20/20；隔离性能
  p95 286.0ms（32×12 表，30 次，目标 ≤ 500ms，见
  `artifacts/logs/T013-release.txt`）。
- 合规：MIT 许可证（`LICENSE`）；第三方许可证清单
  （`THIRD_PARTY_NOTICES.md`）；安全说明（`SECURITY.md`）；发布验证
  `npm run verify:release`（`scripts/verify_release.mjs`）。

## 已知遗留（非阻断，见 `task_handoffs/P029-T013.json` 的 issues）

- Windows / macOS 未实测（`WINDOWS_NOT_TESTED`）。
- P2 级记录问题（见各任务日志 J-裁决）：`analyze()` 内部哈希复核是
  同一实现算两遍（T009-FIX-01 L2）；`NO_WITNESS_FOUND` 时 UI 为取
  reason 再调一次 `findWitness`（L3）；Oracle 的 `alternativeHtml`
  序列化未被规格钉死（T006 O6）。
