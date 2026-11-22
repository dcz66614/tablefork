# 表歧镜 TableFork

> 同一段 Markdown 背后，两张原表可以有不同的合并结构。
> TableFork 现场出示一张结构不同的表 B，与原表 A 生成**完全相同**的
> Markdown，并给出逐格带标题路径的交接稿——证明「只看 Markdown，
> 不可能确定原来的合并关系」。

**本地离线 · 不连接 AI · 不上传 · 不保存。** 输入只留在当前页面内存，
点「清空内存」即删。规格 v1.0.1（`bundle/PROJECT_BOOK.md`）。

## 30 秒 demo

```sh
npm ci && npm run build
npm run analyze -- --input fixtures/TFK-A.json --out /tmp/tablefork-report.json
```

输入（`fixtures/TFK-A.json`，项目书 §6.3 例）：

```html
<table><thead>
<tr><th rowspan="2">产品</th><th colspan="2">2026预算</th></tr>
<tr><th>收入</th><th>成本</th></tr>
</thead><tbody><tr><td>A</td><td>120</td><td>80</td></tr></tbody></table>
```

输出（`tablefork.report/v1`，真实运行结果，`witness: CERTIFIED_COLLISION`）：

```markdown
| 产品 | 2026预算 |  |
| --- | --- | --- |
|  | 收入 | 成本 |
| A | 120 | 80 |
```

替代表 B（只把 `colspan="2"` 的 `2026预算` 拆成两个格）：

```html
<table><thead><tr><th rowspan="2">产品</th><th>2026预算</th><th></th></tr>
<tr><th>收入</th><th>成本</th></tr></thead><tbody><tr><td>A</td><td>120</td><td>80</td></tr></tbody></table>
```

两行机器可重算的断言（真实 SHA-256，`npm run analyze` 输出全文）：

| 断言 | 值 |
|---|---|
| A 图 ≠ B 图 | `aGraphSha256 dbd4b9ce…157d` ≠ `bGraphSha256 a9ec182c…38bc5` |
| F(A) = F(B) | `markdownSha256 83da5104…38c1`，逐字节相等 |
| 见证源格 / 拆分代价 | `sourceCellId c01` / `splitCost 1` |
| 标题关联 | `headerAssociationChanged: true` → `HEADER_ASSOCIATION_CHANGED` |

逐格交接稿（`[R2C1 source=c05] 行标题: ? | 列标题: 2026预算 > 收入 | 数值: 120`）：

```text
[R2C0 source=c04] 行标题: ? | 列标题: 产品 | 数值: A
[R2C1 source=c05] 行标题: ? | 列标题: 2026预算 > 收入 | 数值: 120
[R2C2 source=c06] 行标题: ? | 列标题: 2026预算 > 成本 | 数值: 80
```

浏览器里看同一演示：`npm run dev`，打开 `http://127.0.0.1:5173`，
点预设 **TFK-A** → **比较并寻找反例**，左右双表 + 中央同一份 Markdown
同时出现；TFK-B（行标题归属变化）、TFK-C（无合并，`NO_WITNESS_FOUND`）、
TFK-D（不支持输入）也在预设栏里。

## 诚实边界（本工具不证明什么）

- 只证明**支持的结构表示**发生的信息损失：同一份 Markdown 可对应
  两张结构不同的表。不证明 AI 阅读效果、数据真实性或行业规范合规。
- 「未找到碰撞」（`NO_WITNESS_FOUND`）只表示在限定单格拆分构造器里
  没找到，**绝不等于「表格保真」**。
- 你粘贴的 Markdown M 与工具生成的 F(A) 不一致时（`EXACT_DIFF`），
  碰撞证书只对 F(A) 生效，不伪称适用于 M。
- 未知标题写 `?`，绝不靠启发式编造（例如不把首列数据值 `A` 当成行标题）。
- 只处理单个 HTML 顶层 `<table>`（≤ 32 行 × 12 列、≤ 128 格、≤ 64 KiB），
  不支持嵌套表、`headers` 属性、PDF / DOCX / XLSX 解析。

## 安装与运行

- 环境：Node.js 24.x、npm 10.x、Python 3.12+（仅独立 Oracle 用）。
  实测冻结版本见 `artifacts/logs/T001-env.txt`。
- `npm ci`（请勿用 plain `npm install`，它会因 npm arborist bug 失败，
  见 T001 ADR）→ `npm run build` → `npm run dev`（`127.0.0.1:5173`）。
- 静态构建产物在 `dist/`，可离线服务：`npx vite preview`。

## 常用命令

| 命令 | 说明 | 本轮实测 |
|---|---|---|
| `npm ci` | 按锁文件安装 | exit 0 |
| `npm run typecheck` | `tsc --noEmit`（含 `cli/`） | exit 0 |
| `npm test` | Vitest 单元 + 属性 | 719/719 |
| `npm run oracle` | 独立 Python Oracle 对 48 Golden | 48/48 |
| `npm run build` | 类型检查 + Vite 生产构建 | exit 0 |
| `npm run test:e2e` | Playwright 功能（真实 Chromium） | 20 passed |
| `npm run test:e2e:perf` | 隔离性能：32×12 表 30 次 | 1 passed，p95 286.0ms（目标 ≤ 500ms） |
| `npm run verify:release` | 发布包哈希与清单核对 | exit 0 |
| `npm run analyze -- --input fixtures/TFK-A.json --out out.json` | CLI，写 `tablefork.report/v1` | exit 0 |

完整验收命令、退出码、ZIP 字节数与 SHA-256 见
`artifacts/logs/T013-release.txt`；发布清单见
`review/RELEASE_MANIFEST.json`；全部代码文本分卷见 `review/REVIEW_PACK_*.md`。

## 目录

```text
src/core/      解析 / 网格 / 标题 / 双策略投影 / 见证 / 对账 / 记录 / 报告
src/worker/    唯一 Worker（协议 + tablefork.worker.ts，UI 分析走它）
src/ui/        双表工作台（预设 / 输入 / 双表 / Markdown / 证明 / 导出）
src/io/        本地文件读取（零网络）
cli/           Node 离线 CLI（与 UI 同一内核）
oracle/        独立 Python Oracle + 48 Golden 手算预期
fixtures/      TFK-A..D 预设 + fixtures/golden/G01..G48
tests/         core / property（200 种子）/ e2e（Playwright）
scripts/       verify_release.mjs（发布验证）
review/        REVIEW_INDEX.md / REVIEW_PACK_*.md / RELEASE_MANIFEST.json
artifacts/     logs / screenshots / release（源码 + 构建 ZIP）
```

## 许可证与安全

- 自有代码 MIT（`LICENSE`）；第三方依赖许可证逐包核对见
  `THIRD_PARTY_NOTICES.md`。
- 安全模型与漏洞报告方式见 `SECURITY.md`。
- Windows / macOS 未实测（`WINDOWS_NOT_TESTED`）。
