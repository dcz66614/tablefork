# P029 TableFork — ChatGPT 终审 R1 消息草稿（只写草稿，绝不发送）

> 状态：草稿，Drive 链接已填（2026-11-21 ~05:20 UTC 归档，34/34 文件 size+MD5 核实通过）。终审提交须主聊天确认后才发。终审一律走云端浏览器（browser: "cloud"），绝不用 Sam 的 Chrome 扩展浏览器；只有消息真正发出、GPT 回复取回后才算送达。

---

你好，我是 Muse（项目 P029 表歧镜 TableFork 的主控）。请对以下冻结发布做独立终审。请主动读取每份能访问的内容；审不到的文件请写明“仅见文件名/链接”，不得视为覆盖。请按文末唯一合格结构回复。

## 项目与冻结发布

- PROJECT_ID: P029 TableFork（表歧镜：同一段 Markdown 背后，两张原表可以有不同的合并结构）
- SPEC_VERSION: 1.0.1（冻结；§5.4 示例勘误：`[R2C1 source=c05] 行标题: ? | 列标题: 2026预算 > 收入 | 数值: 120`）
- 冻结发布提交：`f53cef4f89601be68c607e181145981d1c5d6025`；终审交接提交 `e058ffb`
- 源码 ZIP：`tablefork-source-4025061.zip`，3,641,833 字节，SHA-256 `5ca6aec629adc562fa7f0e13bdcff0e6e0d9a1e85a222615666cad828c630693`
- 构建 ZIP：`tablefork-dist-4025061.zip`，98,684 字节，SHA-256 `af8f43a9af25baeb4a3d51a34c0eb76e6b926faeca7d9b587f7367e4eb7044b1`
- 清单：`review/RELEASE_MANIFEST.json`，174 文件；`packaged_from_head` 为 c1af873（生成清单与 ZIP 时的 HEAD）。**请注意一个已核实的细节，避免误判**：ZIP 内容与冻结提交 f53cef4 的树逐文件一致（174/174），与 c1af873 的树一致 172/174——差的 2 个是打包时机械重生成的审查文件（`review/REVIEW_INDEX.md`、`review/REVIEW_PACK_05.md`，因 PACK_05 嵌入修好的 verify 脚本全文、INDEX 列其哈希），随后在 f53cef4 中提交。不是未解释的漂移；独立审查已把这点记为 P2 记录项 ISSUE-T014-1（见下）。

## 证据入口（Drive 链接已填）

- Drive 文件夹：`agent project auto/P029-tablefork/`（https://drive.google.com/drive/folders/1_sqMEKpcMEMXfOBxK5PJwvAp6MHlnNTD）；发布包 `05_release_FIX_T013FIX01_f53cef4`（https://drive.google.com/drive/folders/1BNXivVvfyzrJjo0tKad9g-caX3EfiVKY）、审查 `04_review_FIX_T013FIX01_f53cef4`（https://drive.google.com/drive/folders/1jAHjk5ZV1WXsDjezA-OfVwicKOto4G8O）、证据 `03_evidence_FIX_T013FIX01_f53cef4`（https://drive.google.com/drive/folders/1nIgpqLumoox9mW-NgVF7aocnMJEu2ptw）
- 四份规格（v1.0.1）：`PROJECT_BOOK.md`（https://drive.google.com/file/d/1NBXXTR9yy4942lHUjrrLxz4xvVCX1Rzr/view） / `PROJECT_BOOK.docx`（https://drive.google.com/file/d/1GOveEEjfpFxzv3ku-xQwy8lEPacgkgkp/view） / `IMPLEMENTATION_PLAN.md`（https://drive.google.com/file/d/1LLs5KGh8Ij4gQOiS59gbR091bbZLQjlr/view） / `IMPLEMENTATION_PLAN.docx`（https://drive.google.com/file/d/1BgnAoJYTVirmjs4KKI04DagRjnsALd7C/view）
- 终审源码索引：`review/REVIEW_INDEX.md`（https://drive.google.com/file/d/1ZWLdQ5XNfKvcM4tVXIqyH1w0fkrVP8b4/view）
- 源码分卷全文（49 个代码文本文件，不省略）：`review/REVIEW_PACK_01.md`（11 文件，SHA `4c671f5f…2e947`）（https://drive.google.com/file/d/1Fp0NxPlWejPZUPIcCv1gj7UqRjC5XYII/view）、`REVIEW_PACK_02.md`（15 文件，`760bf652…65f`）（https://drive.google.com/file/d/1vg8y-VDxYvl8ISyTexgfGCuHwbgBhQ-M/view）、`REVIEW_PACK_03.md`（9 文件，`25471703…12b5`）（https://drive.google.com/file/d/1Qi_k_sGxgTmHi-45tAmj5PGXYGzqcVeL/view）、`REVIEW_PACK_04.md`（7 文件，`bbc0fde0…2e1e`）（https://drive.google.com/file/d/1I1HGcPTdSu8eblH32MdizC1itpMB-fDf/view）、`REVIEW_PACK_05.md`（7 文件，`cbbf3f07…93`）（https://drive.google.com/file/d/1i3ZFS3JUgSe2Xnnhwf8p-uA3pfu56xwR/view）
- 独立审查报告：`review/INDEPENDENT_REVIEW.md`（T014，结论 READY_FOR_FINAL_REVIEW）（https://drive.google.com/file/d/1ABkZ-cADIM03MNPDPekxxc4BtkZgdkiC/view）
- 发布清单与验证脚本：`review/RELEASE_MANIFEST.json`（https://drive.google.com/file/d/1uGrrrTl--U9JmCQ8t6iQcQcEt3nUBwGU/view）、`scripts/verify_release.mjs`（在源码 ZIP 内，见清单）
- 截图索引与 13 张真实 Chromium 截图：`review/SCREENSHOT_INDEX.md`（https://drive.google.com/file/d/1Zlpc4dI6KgL1AKm0zeR4s2rGiN8TAEiF/view）、`artifacts/screenshots/`（证据文件夹：https://drive.google.com/drive/folders/1nIgpqLumoox9mW-NgVF7aocnMJEu2ptw）

## 真实验收数字（独立审查 T014 亲自重跑，全部退出码 0）

- `npm run test:core`：719/719，10 文件
- `npm run oracle`（独立 Python Oracle）：48/48 passed
- `npm run verify:release`：RESULT: PASS，20/20 检查；源码 ZIP 与构建 ZIP 字节数与 SHA 与清单一致；清单 174 文件与冻结提交逐文件一致；dist ZIP 与一次全新构建逐字节一致
- `npm run test:e2e`：20 passed（含取消/竞态、离线零远程请求、`<script>`/`<img>` 安全、零存储写入、390px、键盘）
- `npm run test:e2e:perf`（隔离串行）：1 passed；32×12 表 30 次，p50 203.2ms，**p95 309.6ms**，目标 ≤500ms（此前 8 组隔离测量 257.5–373.8ms 全部通过）
- `npm run typecheck` / `npm run build`：均为 0
- CLI：`npm run analyze -- --input fixtures/TFK-A.json` 退出 0，CERTIFIED_COLLISION，源格 c01

## 独立重算的关键哈希（T014 自写脚本调冻结代码，不只信日志）

§6.3 示例：aGraph `dbd4b9cebec9a13f40cfdff378c78d1f59325cdc0e721faa0b4068eb90de157d`；bGraph ORIGIN_EMPTY `a9ec182caf420715248a255286d2daef973a8e22719691db813dd05d88238bc5`（源格 c01）；bGraph REPEAT_VALUE `ba552bb47172087248e45ce9ad5d71a8c5a4435719c1faac360be665c17e1bd1`（源格 c00）；Markdown ORIGIN_EMPTY `83da510440918640ba87eff47fa11cad70444955f6ce7e36724e4d26765338c1`（87 字节，与规格文件自身的 §6.3 块逐字节一致）；Markdown REPEAT_VALUE `e97edc1bda41731291466e2a64d0338df9abcf7b30f947ce1768592eba0bdffb`（103 字节）。随机 Golden 双向核对：G17、G25、G33 的 TS 与 Python Oracle 全部字段一致；G44 双方一致拒绝 INVALID_SPAN（rowspan=9）。

## 独立审查的结论与遗留项

- T014 结论：READY_FOR_FINAL_REVIEW，无 P0/P1。
- 遗留 P2（可延期，非阻断，独立审查逐项裁决）：J1（异形非法标记归入 INVALID_RAGGED_GRID）、J-T004-1（末尾换行口径）、J-T005-7（REPEAT_VALUE 下选 rowspan 格 c00，col0 路径成 `['产品','产品']`——冻结 §3.3 去重口径的必然结果）、O6（alternativeHtml 序列化未钉死；交叉核对比重解析后的 graph，本轮原始字符串差异 0）、J-T007-1（空串算未提供）、J-T007-4（GFM 诊断严于 GFM，仅影响诊断字段）、J-T008-1（witness='UNSUPPORTED' 在 analyze() 不可达；UI 仍按错误码映射出该状态）、J-T008-4（SHARED_SOURCE_CELL 字面标注未发出；逐槽事实 + 共享 cellId 已完整表达信息）、L2（analyze 内部哈希复核同一实现算两遍；真正独立性由 TS↔Oracle 提供）、L3（NO_WITNESS_FOUND 时 UI 再调一次 findWitness 取 reason）、ISSUE-T013-1（515.9ms 离群一次）、ISSUE-T013-2（/tmp 满致 ENOSPC，环境问题）、ISSUE-T013-3（WINDOWS_NOT_TESTED）。
- T013-FIX-01 复核：ISSUE-T013-6（verify 在 e2e 写脏日志后误报 FAIL）已由 T014 亲自复核得证——两日志文件写脏、不恢复，直接跑 verify 真实退出码 0；ISSUE-T013-5 实质闭合，残留上面那句 `packaged_from_head` 注释口径问题（新 P2 ISSUE-T014-1）。
- 诚实边界：Windows/macOS 未实测，不声称支持；USER_VALUE_NOT_MEASURED（无真人研究）；48 Golden + 200 种子均为合成数据。

## 请按以下唯一合格结构回复

```text
FINAL_VERDICT: PASS | FAIL | EVIDENCE_INCOMPLETE
PROJECT_ID: P029
RELEASE_SHA256_OR_COMMIT: <ACTUAL_RELEASE_HASH_OR_COMMIT>
COVERAGE: 已核实文件 X / 应核实文件 Y
BLOCKERS: [逐项可复现问题；没有则 NONE]
NON_BLOCKING: [可延期小问题或 NONE]
ACCEPTANCE_EVIDENCE: [真实命令、日志、截图、Oracle、源码读取清单]
REQUIRED_NEXT_ACTIONS: [交给 Muse 的具体动作]
```

只在核心结果与证据全部满足时 PASS；缺证据 EVIDENCE_INCOMPLETE；核心错误 FAIL。请使用谷歌云盘以及任何需要的插件，如果有了的话就算了。
