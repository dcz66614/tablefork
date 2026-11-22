# TableFork — 安全说明

> 规格：PROJECT_BOOK.md v1.0.1 §8；本文件只陈述已实现并已实测的安全属性，
> 不作未经测试的承诺。未在 Linux 以外平台实测之处写明 `WINDOWS_NOT_TESTED`。

## 运行模型：本地离线，无网络、无模型调用

- TableFork 是纯本地静态应用：`npm run dev` / `vite preview` 只在
  `127.0.0.1` 上服务本机构建产物；运行时不发起任何出站网络请求。
- 不调用任何 AI 模型、API 或远程服务；不请求远程字体、脚本、样式或图片。
- 不写 `localStorage` / `IndexedDB` / cookie；不做 telemetry，不上传输入。
- 输入只留在当前页面内存中；点「清空内存」即清除输入、Markdown、结果与
  下载 Blob 引用（`artifacts/logs/T012-e2e.txt` §4 有真实 DOM 核对）。

## 输入处理：只作文本解析，绝不注入为活动 HTML

- 用户 HTML 只进严格限定子集解析器（`src/core/parse.ts`），不以
  `innerHTML` 插入活页面；单元格以 React 文本节点展示。
- `<script>`、`<img>`、事件属性、外链 CSS 一律不执行：解析层只读
  `rowspan` / `colspan` / `scope` / `headers` 四种属性，其余属性忽略；
  恶意字符串只以文本留在输入框（E2E 测试 16、17 实测通过，零远程请求、
  零 `<script>` / `<img>` / `<iframe>` 节点）。
- 导出报告（`tablefork.report/v1` JSON）与交接稿只由用户手动触发下载或
  复制；报告原文可能含敏感内容，由用户决定是否保存，工具不替用户决定。

## 输入上限（超限直接拒绝，不猜测、不修复）

- HTML / Markdown 各 ≤ 64 KiB UTF-8；原表 ≤ 32 行 × 12 列、≤ 128 个 DOM
  单元格；`rowspan` / `colspan` 各 1–8；不支持嵌套表、`headers` 属性、
  `scope=rowgroup/colgroup`。超限或不支持时报枚举错误码
  （`INVALID_SPAN`、`INVALID_GRID_OVERLAP`、`INVALID_RAGGED_GRID`、
  `OVER_SIZE`、`UNSUPPORTED_NESTED_TABLE`、`UNSUPPORTED_HEADER_SEMANTICS`、
  `CANCELLED`），绝不返回误导性的分析结果。

## 依赖与构建

- 依赖全部锁定于 `package-lock.json`（SHA-256 见 `review/RELEASE_MANIFEST.json`）；
  构建只用本地 `node_modules`，不拉取远程代码。第三方许可证见
  `THIRD_PARTY_NOTICES.md`（逐包核对自 `node_modules` 的 `package.json`）。
- 发布包验证：`npm run verify:release`（`scripts/verify_release.mjs`）
  核对源码 ZIP 清单与逐文件 SHA-256、构建 ZIP 与全新构建的一致性、
  清单覆盖率与 REVIEW_PACK 哈希。

## 漏洞报告

TableFork 目前是研究原型，没有专职安全团队与赏金计划。如发现安全问题，
请通过项目仓库的 Issue 提交（请勿在公开 Issue 中粘贴真实办公文档、
个人数据或凭证；复现输入请用合成表格），并注明：

1. 复现输入（合成 HTML 表格原文）与操作步骤；
2. 预期行为与实际行为（含浏览器版本、Node 版本）；
3. 是否涉及数据外发、脚本执行或持久化写入（本工具设计上三者皆无）。

收到报告后，维护者将复现、定级（P0/P1/P2，见实施计划 §11），并在修复后
重新跑全部验收（`npm ci`、`typecheck`、`test`、`oracle`、`build`、
`test:e2e`、`test:e2e:perf`、`verify:release`）与重新冻结发布包。

## 已知边界（不是漏洞，是诚实声明）

- 「未找到碰撞」（`NO_WITNESS_FOUND`）只表示在限定单格拆分构造器里没
  找到，不表示表格保真、AI 一定读对或数据真实。
- 碰撞证书只证明「同一份 Markdown 可对应两张结构不同的表」，不证明 AI
  阅读效果、数据真实性或行业规范合规。
- Windows 平台未实测（`WINDOWS_NOT_TESTED`）；macOS 同样未实测。
