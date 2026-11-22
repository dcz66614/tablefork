# P029 表歧镜 TableFork｜完整项目书

**副标题：同一段 Markdown 背后，两张原表可以有不同的合并结构——AI 表格交接的反事实歧义取证仪**

| 项目字段 | 冻结决定 |
|---|---|
| PROJECT_ID / slug | `P029` / `tablefork` |
| SPEC_VERSION | `1.0.2` |
| 决定日期 | `2026-11-20` |
| 规格状态 | `SPEC_FROZEN / NO_IMPLEMENTATION / RESULTS_NOT_VERIFIED` |
| 唯一正式归档路径 | `agent project auto/P029-tablefork/`（已上传 Drive 并回读核实，2026-11-20） |
| 许可证 | MIT（仅项目自有代码；第三方许可证逐项保留） |
| 工时及工程门 | 88 小时，14 个独立任务 `P029-T001`—`P029-T014`，2 周原型，0 真人参与者 |
| 依赖基线 | `IMPLEMENTATION_PLAN.md` v1.0.2、`P029_IDEATION_REPORT.md` |
| 角色 | GPT-6 规格与最终独立验收；Muse 派工、门禁、归档；Coding Agent 编码、测试、构建、修复；独立 Oracle 不复用核心实现 |

> **勘误注 v1.0.1（2026-11-21，裁决者 Muse）：** 本版仅做最小勘误，不改功能与门槛。(1) §5.4 交接稿示例改为 `[R2C1 source=c05] 行标题: ? | 列标题: 2026预算 > 收入 | 数值: 120`（原 `source=c03` 与 `行标题: 产品=A` 有误：按 §3.2 排序，120 的来源是 c05；该表 tbody 无 `th scope=row`，按 §3.3 行标题未知只能写 `?`），并补一句“行标题来源仅限 §3.3 规定的 tbody th scope=row，不得用首列数据值充当行标题。”(2) §9 推荐树补 `src/core/index.ts`。(3) 封面“唯一正式归档路径”与 §11.6 第 6 项改为已上传 Drive 并回读核实（2026-11-20）。另记录在案（本文不改）：P2-03 以冻结规格为准（p95 ≤ 500ms、48/48），T001 交底时注明；P2-04 T005 验收的 Node CLI 调用为自备临时脚本，派工时写明。

> **勘误注 v1.0.2（2026-11-21，裁决者 Muse）：** 本版为 R1 P1-02 的规格勘误（主聊天裁决：§9 优先，§6.1 同步补上）。(1) §6.1 `AnalyzeResult` 补 `jobId` / `inputHash` / `specVersion` 三个必填字段，与 §9“所有报告具 jobId + inputHash + specVersion”一致。(2) §6.2 公共内核签名改为 `analyze(input, jobId)`，`jobId` 为必填第二参数，不得给空串默认值（fail-closed）。(3) §9 补 `inputHash` 的定义：输入 HTML 原文的 SHA-256（UTF-8 字节，十六进制小写）。(4) §3.1 明确首尾 trim 仅去 ASCII 空白、U+00A0 保留（文字口径，与 Oracle 文档串 J6/O5 一致；`normalizeCellText` 的实现不动，见 FIX-03）。`SPEC_VERSION` 升为 `1.0.2`。(5) FIX-03 addendum（2026-11-21）：新增 Golden G49（首尾 U+00A0 保留，`&nbsp;x&nbsp;`），Golden 总数 48→49；`normalizeCellText` 的首尾 trim 改为仅去 ASCII 空白（实现向 Oracle 对齐，R1 P2 #3）。

> **一句话价值：** 当中文用户把有合并表头的报价/政策/课程对照表转成 Markdown 交给 AI，TableFork 不要求 AI 自己猜哪项数据属于哪个标题，而是现场出示**两张结构不同的表，却会生成完全相同 Markdown 的可检验反例**，并给出可重新核对的逐格全路径交接文本。它只证明支持的结构表示发生的信息损失，不证明 AI 阅读效果、数据真实性或行业规范合规。

## 1. 痛点先行：具体使用者、使用时刻和可量化假设

### 1.1 主要用户故事

一位每周整理多份中文产品套餐/部门预算表的运营助理，在周三 19:00 用 Windows 笔记本浏览器，将办公文档或网页导出的 HTML 表格交给 AI 概括差异。原表包含两级列标题（如“2026 预算→收入、成本”）以及按部门合并的行标题。在常见的 Markdown 表格里，`rowspan`/`colspan` 无原生表示。即使所有文字仍然出现，AI 所收到的普通字符序列也可能不再携带完整归属信息。

**规划假设（不是真人调研）：** 每周遇到约 3 次，痛点 5/5，手工逐格检查需 20–40 分钟。当前 workaround 是截图、复制粘贴原 HTML、给每个值手写完整表头；缺陷是看不出“哪一段普通 Markdown 具有不可逆的多种原表解释”，难以自动复测。目标是让用户在发送前看到具体反例及某个数据值所属的行/列标题，避免把不确定来源伪称唯一解释。

**第二用户：** 将内部 HTML/Office 转换结果发给 AI 的技术内容编辑，在交接前需要知道文本保真与结构保真不是一回事。此为次级用户，MVP 不做 PDF 解析或 Office 原文件输入。

### 1.2 真实外部依据及局限

1. **GitHub 关注：** `microsoft/markitdown` 2026-11-20 出现在 Python Trending 快照，核心用途为文档转 Markdown 供 LLM 处理。榜单不是实际活跃人数或付费意愿。https://githubtrending.today/repo/microsoft/markitdown/ ；https://github.com/microsoft/markitdown 。
2. **实际工程反馈：** Docling #3830 指出合并单元格导出 Markdown 时结构无法原样表达。维护者称这是设计选择，并在 2026-07 解决了相应文档说明问题；**不得报告为当前未修复软件缺陷。** https://github.com/docling-project/docling/issues/3830 。
3. **官方序列化边界：** Docling 官方支持 Markdown 扁平化；HTML、JSON 保留单元格 span；不同版本策略可能用空白延续格或复制单元格文字，TableFork 只模拟明确冻结的两个策略，不声称复现全部 Docling 历史行为。https://docling-project.github.io/docling/concepts/serialization/ 。
4. **HTML 标准：** WHATWG HTML table model 规定网格、单元格覆盖与 header 归属算法；本 MVP 是其**明确缩减的子集**，不是完整 HTML conformance 检验器。https://html.spec.whatwg.org/multipage/tables.html 。
5. **研究：** RealHiTBench 2025（https://arxiv.org/abs/2506.13405）、LTEM 2026（https://arxiv.org/abs/2610.29188）和 OHD 2026（https://proceedings.mlr.press/v306/cao26p.html）分别探讨层级表格及表达形式。不能搬用其实验样本/跑分、声明本项目解决复杂表格理解。
6. **人机信任：** Stack Overflow 2026 调查中 n=14,304，48.0% 在容易核验时才信任 AI 输出；仅作为开发者研究背景，不转化成中文办公用户出现率。https://survey.stackoverflow.co/2026/ai/data/ai-trust 。

### 1.3 直接竞品与不应复制部分

| 先例 | 已经做了什么 | 本项目仅借鉴 | 明确不能复制/冒充 |
|---|---|---|---|
| `microsoft/markitdown` https://github.com/microsoft/markitdown | 多种文档转 Markdown | 真实工作流入口、格式边界 | 不复制转换器、也不做全文件格式兼容 |
| Docling https://github.com/docling-project/docling | 文档解析与 HTML/JSON/Markdown 序列化 | span 丢失可复现问题 | 不复制其 parser / 模型 / GUI；不冒充 PDF 解析 |
| `table2rules` https://github.com/PebbleRoad/table2rules | 已能导出每行携带行列标题的事实 | “标题路径随数值走”的设计启发 | **绝不把带路径导出称为本项目新发明** |
| `html-table-rescuer` https://github.com/Encephos/html-table-rescuer | 合并 HTML 表格的规范化、Markdown 导出 | 合法网格测试类型 | 不复制其网格求解器、布局及 benchmark |
| LTEM https://arxiv.org/abs/2610.29188 | 提出带表格结构语法扩展的 LLM 友好格式 | 表格表示问题的研究证据 | 不实现其格式、模型评测或报告其性能 |
| WHATWG https://html.spec.whatwg.org/multipage/tables.html | HTML table model 和 header 关系 | 子集规则源头 | 不宣称完整支持 `headers`/`scope`/所有 HTML 兼容性 |

**我们的差异化不是“转换”，而是反证交互：** 本地导入 `源表 A + 待交接 Markdown M`，报告 M 是否与明确的序列化策略相符，并在能构造时给出一张结构不同的 `B`，连同 `A ≠ B`、`F(A) = F(B)` 两个机器可重算断言。由此证明“只看 M 不可能确定原来合并关系”；再给出逐格带来源路径的建议交接文本。这个组合是否有市场独特性仍未经大规模竞品审查，不能声称首创。

## 2. 目标、非目标与价值衡量

### 2.1 明确目标

- **G01** 在可复现的纯本地合成 HTML 表格子集上生成正确的覆盖网格和单元格来源坐标。
- **G02** 以 `ORIGIN_EMPTY` 和 `REPEAT_VALUE` 两种**明示**的损形规则生成普通 Markdown，并验证原表与待发 Markdown 的关系。
- **G03** 只要支持的输入存在至少一块合并单元格，便构造并验证一个**局部拆分**的替代原表，形成碰撞证书；未构造成功时只说未获证，不得谎报保真。
- **G04** 逐数据格输出行/列显式表头路径、来源坐标及原文值；用户可检查、修改、复制、下载、清空。
- **G05** 通过 Python 独立 Oracle、手写预言案例、UI 自动化与源码哈希验收。

### 2.2 明确非目标

- 不上传或采集真实文件、不会连接 AI 助手，不调用模型，不做 token 计费预测。
- 不支持 PDF 识别、DOCX/XLSX 解析、OCR、截图识别、图片/文本推断真实表头；不重做 P026 引文落页。
- 不对普通 Markdown 的内容正确性、表格事实真假、AI 答案质量作保证。
- 不支持嵌套表格、CSS 视觉合并、复杂脚注、CSS 生成的伪标题、任意 HTML 表格，MVP 不实现 HTML 的完整 `headers` 自动分配算法。
- 不在工作区写入用户原表的持久化缓存，不保留剪贴板自动监听，不提供云部署数据收集、用户账号、团队平台或收费方案。
- 不采用“没有找到碰撞就证明表格绝对安全”的错误逻辑。

### 2.3 双层成功定义

- **机器层可验：** 49 份人工推导的合成 Golden、至少 200 个固定种子合法表变异、碰撞再序列化相等、不可支持输入拒绝、导出/清空功能与 UI 演示、独立 Python Oracle 完全一致。
- **用户层不可验：** 实际节省多少核对分钟、是否愿意复访、会否让 AI 回答更正确、开源流量/收购吸引力。标记 `USER_VALUE_NOT_MEASURED`，不得以合成数据冒充真人研究。

## 3. 固定数据范围与处理语义

### 3.1 输入契约

| 规则 | 规格 |
|---|---|
| 原表输入 | 浏览器文本粘贴或选择 `.html` 文件；**只处理其单个顶层 `<table>`**，输入最大 64 KiB UTF-8 |
| Markdown 输入 | 可选粘贴或选择 `.md`；最大 64 KiB UTF-8；单个普通 GFM 风格 pipe 表，或无输入时由内核生成 |
| 表格上限 | 原表 `1–32` 行、`1–12` 列、最多 `128` 个 DOM 单元格，单一 `thead` + 可选单一 `tbody` |
| 合并上限 | `rowspan` 和 `colspan` 各 `1–8`，不可跨 `thead/tbody` 边界或造成格子重叠 |
| 有效标签 | `table/thead/tbody/tr/th/td/caption` 及单元格内纯文本；忽略只读文本容器中的非结构性标记，不渲染用户 HTML |
| 标题规则 | `thead` 中的 `th` 作为列标题、`tbody` 中 `th scope="row"` 作为行标题；`scope="col"` 仅限 `thead`，无 `scope` 的其他 `th` 视为语义未知；`scope=rowgroup/colgroup` 和 `headers` 属性都显式报 `UNSUPPORTED_HEADER_SEMANTICS` |
| 格式处理 | 原文本保留 Unicode 码点；只在单元格提取时将 HTML 实体解码，折叠连续纯文本空白为一个 U+0020，首尾 trim（仅去 ASCII 空白；U+00A0 保留）。规范规定这会丢格式，不声称逐字保留 HTML 源码 |
| 分组 | 无表头行的输入仅分析结构，不输出声称已验证的列路径；多 `<table>`、嵌套表格拒绝，用户选择一个表重新导入 |
| 导出策略 | `ORIGIN_EMPTY` 原点留值、延展格留空；`REPEAT_VALUE` 每个覆盖格复制原值；都固定在可审计文本里写明 |
| 清空 | 一次点击清空源码、Markdown、衍生记录、比较结果、下载 Blob 引用和历史状态；不写 localStorage/IndexedDB |

### 3.2 网格形式定义

给定按 DOM 文档顺序读取的结构单元格 `c_i = (r_i, x_i, h_i, w_i, kind_i, text_i)`。`r_i` 为原点行（0-based），`x_i` 为该行从左至右第一个未占用列，`h_i=rowspan`，`w_i=colspan`，`kind_i∈{TH,TD}`。该单元格覆盖矩形 `S_i = [r_i,r_i+h_i) × [x_i,x_i+w_i)`。

**合法性：** 任两格 `S_i ∩ S_j = ∅`；所有被占用槽位位于允许的 32×12 网格内；每个实际行 `r` 均应被唯一单元格覆盖，且其覆盖从列 0 连续到该表的总列数减一。无跨度的空值格可以合法存在（字符串为空）；缺失格但不连续的输入判 `INVALID_RAGGED_GRID`。不存在 DOM 级单元格重复占槽位。

**字段：** 单元格 ID 按原点行、原点列、DOM 序稳定排序为 `c00,c01,...`；`slotOwner[r][x]=cellId`。合并属性保留为整数，不推断 CSS 视觉宽度。

### 3.3 标题路径语义（非 WHATWG 完整算法）

- 对数据格 `d` 的每个列槽 `x`，在 `thead` 中按行由上至下取覆盖 `x` 的所有非空 `th` 文本作为 `colPath(x)`；重复同一 `cellId` 的延展槽在该路径中只出现一次。
- 对数据格 `d` 的每个行槽 `r`，在 `tbody` 的该行从左至右取拥有 `scope=row` 的非空 `th` 作为 `rowPath(r)`；在 `rowspan` 延续行里仍使用同一来源 `cellId`，但不生成重复文本。
- 如果某个 `td` 跨多行或多列而不同槽位的标题路径不同，**不可把它强行压成一条记录**；逐槽输出携带 `(r,x)` 的事实行，且标注 `SHARED_SOURCE_CELL`，每行指向同一来源 `cellId`。
- 列标题/行标题缺失则 `headerStatus=UNKNOWN`，仍可证明**合并结构**碰撞，但 UI 禁止宣称“已证明该值属于某个业务概念”。
- 明示范围：仅对上述结构化已声明标题建图，不推断用户在视觉上“想表达什么”。

## 4. 交互流程与精确 UI

### 4.1 导航与屏幕布局（桌面优先，窄屏纵向折叠）

**首页一个工作台而非大型平台：** 顶栏 `表歧镜`、小字 `离线·只读·不连接 AI`；上方四个可切换的合成预设按钮及 `粘贴 HTML / 打开本地 .html`；紧接着可编辑 Markdown 文本区与策略开关 `ORIGIN_EMPTY / REPEAT_VALUE`。按钮 `比较并寻找反例` 在输入合法时可点击；错误状态时说明具体行列。

分析后以**并排左右双表 + 中央单段 Markdown**为主视觉：左为原表 A 的二维网格（合并格可见跨线与颜色），右为按构造规则得到的不同表 B（至少一个拆开的格），中间同一份 Markdown 代码。悬停/键盘聚焦一格，左右来源位置高亮、Markdown 中对应的文本位置高亮。下方状态栏 `结构碰撞已证实 / 未发现证明 / 不支持` 与 `M 是否匹配 F(A)` 单独显示，绝不能把两者混成“安全/危险”一个分数。

最下方两个可切换标签页：`逐格交接稿`（`row-path | col-path : value`，每行附来源）与 `可审查证据 JSON`。按钮为 `复制交接文本`、`下载 JSON`、`清空内存`，且均有真实功能，不显示虚假的“已被 AI 使用”。

### 4.2 状态、异常和无障碍

- **EMPTY：** 展示合成示例入口、隐私声明，无结果。
- **READY：** 源表有效，文本区可编辑；比较前仍允许修改。
- **ANALYZING：** 工作线程处理，按钮变 `取消`；取消后旧计算结果不得覆盖新输入。
- **CERTIFIED_COLLISION：** 展示 A≠B 且 F(A)=F(B) 两行独立断言；若标题关联差异确实成立，另打 `HEADER_ASSOCIATION_CHANGED`，否则只说 `STRUCTURAL_COLLISION`。
- **NO_WITNESS_FOUND：** 只表示在限定构造器里没找到，不表示保真；表格原文若本就平坦通常如此。
- **MISMATCH：** 单独说明粘贴的 M 与当前指定策略 F(A) 不相等，定位首个不同 UTF-8 字节附近的字符区间；此时生成的碰撞证书只对 F(A) 生效，不伪称适用于 M。
- **UNSUPPORTED / INVALID_INPUT：** 示例包括嵌套表格、跨组 rowspan、`headers` 引用、超上限、HTML 非表格；明确“不可确认”，不回退为猜测。
- 键盘完整覆盖导入、预设、分析、Tab、复制、下载、清空。反证不单靠颜色区别；每个表格格子有文字/来源坐标标签，SVG 连接线有可读说明。
- UI 文字默认中文，等宽数据展示采用可用系统字体，不请求远程字体；移动宽度 390px 为布局检查目标，复杂操作仍以桌面为主要入口。

### 4.3 四个确定性演示预设

- `TFK-A`：两层列标题中的 `colspan=2`，拆分后两张表发同一份 Markdown；最典型主视觉。
- `TFK-B`：部门 `th scope=row rowspan=2`，两个项目行的行标题归属变化。
- `TFK-C`：纯矩形无合并，报告 `NO_WITNESS_FOUND`，绝不显示“绝对保真”。
- `TFK-D`：明确写出 `headers=` 或嵌套 `<table>`，报告 `UNSUPPORTED_HEADER_SEMANTICS` 或 `UNSUPPORTED_NESTED_TABLE`。

## 5. 核心算法及数学可核验命题

### 5.1 两个扁平化映射

设合法表结构为 `A`、覆盖格序列为矩阵 `G_A`。定义 `F_p(A)` 返回 UTF-8 文本：每个 HTML 原表行按 `slotOwner[r][x]` 生成 `| cell |`，在第 1 行后插入 Markdown 分隔行 `| --- |...|`，最后统一 LF 换行。单元格特殊 Markdown 元字符 `|` 使用 `\|` 转义，反斜杠依次按定义转义；生成函数必须先转义反斜杠再转义管道，避免不稳定。输入文本换行统一表示为单个空格（在 HTML 文本抽取阶段）。两个策略：

1. **`ORIGIN_EMPTY`：** 如果 `(r,x)` 是单元格的左上原点，显示 `text_i`，否则填空字符串。
2. **`REPEAT_VALUE`：** 对该 cell 覆盖的每个槽位显示 `text_i`。

`F` 丢弃了原点以外的 span 属性以及 `th`/`td`/`scope` 等结构性标签。`F` 是本项目定义的实验映射，**不是保证与任一真实版本 Docling/MarkItDown 输出逐字节一致**。

### 5.2 碰撞证书与“最短”定义

**固定证书命题：** 对合法输入 A，只要存在合并单元格 `s`（`h_s×w_s>1`），构造 `B=split_s(A)`：保持其他所有 DOM 单元格原样；把 `s` 覆盖的每个槽位改为独立单格，原点复制原文，延续槽位在 `ORIGIN_EMPTY` 中填空、在 `REPEAT_VALUE` 中填同文，并保留原点所属 rowgroup；拆分后它们不再共享 span 关联。若合法性与导出检查全部通过，则给出证书 `(A, B, F(A), F(B))`，同时断言 `canonicalCellGraph(A) ≠ canonicalCellGraph(B)` 与 `UTF8(F(A)) == UTF8(F(B))`。

在含多个候选合并格时，**先优先选择能够改变项目书 §3.3 所声明表头路径的拆分**，同级再按 `extra_slots = h*w - 1` 从小到大、原点行/原点列/cellId 字典序选首个成功格。如果没有标题路径改变的合法候选，则选择结构差异的最小拆分候选。这是“先保证证明有意义、再在该类别内求最小拆分代价”，不是全世界所有原表中的绝对最小反例。全部候选失败则 `NO_WITNESS_FOUND` 并给出理由。无合并时不证明 `F` 可逆。

**附加区别：** 若按 §3.3 计算的任一同一位置 `rowPath/colPath` 在 A/B 变化，再追加 `HEADER_ASSOCIATION_CHANGED`；只有结构不同、行列路径未知时只报告 `STRUCTURAL_COLLISION`。这是防止把“合并格不同”无限扩大成“语义意思不同”的核心诚信边界。

**必须测试两个层面：** `F_p(A)=F_p(B)` 对每一种策略单独成立；A 与 B 的 `canonicalCellGraph` 必须不同。并且派独立 Python Oracle 重新解析二者与重新序列化，不得只是 TS 内核自行报告成功。

### 5.3 Markdown 对账不是碰撞证明

用户粘贴的 `M` 与 `F_p(A)` 的比较：`EXACT_MATCH` 当且仅当 UTF-8 字节完全相同；`EXACT_DIFF` 显示首个不同字节下标及相邻显示字符；`NOT_SUPPLIED` 表示未输入 M，页面可预览生成值。除非 `M` 与 `F_p(A)` 相等，不得把 `F_p(A)=F_p(B)` 的证书写成 `M=F_p(B)`。Markdown 语法解析仅用于视图定位和校验单个 GFM pipe 表，不解释数学/图像语义。

### 5.4 逐格交接文本

对每个 `td` 占用的槽位，稳定序列化：

```
[R2C1 source=c05] 行标题: ? | 列标题: 2026预算 > 收入 | 数值: 120
```

**没有明确标题的槽位**必须写 `行标题: ?` 或 `列标题: ?`，不得靠启发式编造。行标题来源仅限 §3.3 规定的 tbody th scope=row，不得用首列数据值充当行标题。交接稿旨在清楚把限定结构编码为文字，不证明远端 LLM 一定按这些文字理解。导出携带源 `sha256` 和格式版本 `tablefork.report/v1`。

### 5.5 确定性与运行限制

- 输入排序、函数文本换行、数据格顺序、候选拆分排序、JSON 键输出顺序冻结，禁止随机依赖用户时间、系统区域设置或远程环境。
- 两种策略使用相同的网格和不同的延展槽值填充。处理 32×12、128 源单元格、64 KiB 输入的 95 分位耗时目标 <=500ms（目标，不是实测）。
- 输入超过界限直接显式拒绝，不递归推理 CSS、不借助 LLM 补全。
- 对不是有效 HTML 表的内容不运行假定转换；错误至少包括 `INVALID_GRID_OVERLAP`、`INVALID_RAGGED_GRID`、`INVALID_SPAN`、`OVER_SIZE`、`UNSUPPORTED_NESTED_TABLE`、`UNSUPPORTED_HEADER_SEMANTICS`、`CANCELLED`。

## 6. 数据结构、接口与输出示例

### 6.1 TypeScript 核心数据类型（权威字段）

```ts
type Strategy = 'ORIGIN_EMPTY' | 'REPEAT_VALUE';
type HeaderStatus = 'KNOWN' | 'UNKNOWN';
type CompareStatus = 'EXACT_MATCH' | 'EXACT_DIFF' | 'NOT_SUPPLIED';
type WitnessStatus = 'CERTIFIED_COLLISION' | 'NO_WITNESS_FOUND' | 'UNSUPPORTED';
interface Cell { id: string; row: number; col: number; rowSpan: number; colSpan: number;
  role: 'TH' | 'TD'; scope: 'row' | 'col' | null; text: string; section: 'thead' | 'tbody'; }
interface SlotFact { row: number; col: number; cellId: string;
  rowHeaders: string[]; colHeaders: string[]; headerStatus: HeaderStatus; value: string; }
interface AnalyzeInput { schema: 'tablefork.input/v1'; html: string;
  suppliedMarkdown?: string; strategy: Strategy; }
interface CollisionProof { sourceCellId: string; alternativeHtml: string;
  aGraphSha256: string; bGraphSha256: string; markdownSha256: string;
  splitCost: number; headerAssociationChanged: boolean; }
interface AnalyzeResult { schema: 'tablefork.report/v1'; jobId: string;
  inputHash: string; specVersion: string; compare: CompareStatus;
  witness: WitnessStatus; canonicalMarkdown: string;
  facts: SlotFact[]; proof?: CollisionProof; warnings: string[]; }
```

`sha256` 只用于记录**本地文件内容身份和重现比较**，不意味着签名或防篡改来源认证。项目不得使用来源/版本未明确的仓库哈希替代发布包文件哈希。

### 6.2 独立 CLI 和 Worker 协议

- 公共浏览器内核 `analyze(input, jobId): Promise<AnalyzeResult>`；无 Node 专属调用。`jobId` 为必填第二参数（Worker 传消息外层的 `jobId`；CLI 传 `cli-<fixture_id>`），不得给空串默认值。
- Worker 事件 `{jobId, type:'ANALYZE', payload}`，结果 `{jobId, type:'RESULT', data}` 或 `{jobId, type:'ERROR', code, message}`；取消 `{jobId, type:'CANCEL'}`；主线程只应用 `jobId` 与最新输入版本一致的结果。
- Node 离线 CLI `npm run analyze -- --input fixtures/TFK-A.json --out output/report.json` 用于自动化复测，内部可加载与 UI 同一个纯 TS 算法库。
- Python Oracle 脚本从 JSON 输入读单表并输出 `oracle.report/v1`；须独立手写解析/网格/序列化逻辑，禁止 import TS 构造的结果当真值。

### 6.3 端到端样例（预期，不代表已经运行）

原始 HTML A：

```html
<table><thead>
<tr><th rowspan="2">产品</th><th colspan="2">2026预算</th></tr>
<tr><th>收入</th><th>成本</th></tr>
</thead><tbody><tr><td>A</td><td>120</td><td>80</td></tr></tbody></table>
```

在 `ORIGIN_EMPTY` 下的规范 Markdown（展示值及合并延展的空格，但不保留合并关系）：

```markdown
| 产品 | 2026预算 |  |
| --- | --- | --- |
|  | 收入 | 成本 |
| A | 120 | 80 |
```

替代 HTML B：只把第一行 `th colspan="2"` 拆成相邻的 `<th>2026预算</th><th></th>`，保留左边 `th rowspan="2"` 原样不动。这样右侧“成本”的 `2026预算` 父级不再由合并标题覆盖，但在 `ORIGIN_EMPTY` 策略下输出的 Markdown 完全一致。按 §5.2 的“优先展示有已声明标题路径改变的证书，再比拆分代价”规则，应选择这块 `colspan`。该结果仍须经真实实现与独立 Oracle 的逐字节验证。

交接稿数据行应能证明：

```
[R2C0] 行标题: ? | 列标题: 产品 | 数值: A
[R2C1] 行标题: ? | 列标题: 2026预算 > 收入 | 数值: 120
[R2C2] 行标题: ? | 列标题: 2026预算 > 成本 | 数值: 80
```

注意 `产品` 属于列标题且行标题未知，示例只能显示 `?`，不能擅自假定 A 是“产品名”这一外部业务事实。`CERTIFIED_COLLISION` 依赖实际运行的字节比较与独立 Oracle，当前仅是预期。

## 7. 验证矩阵、可复现样本与交付证据

### 7.1 固定手写 Golden 组合（49 个，不得仅从被测实现复制）

| 组 | 数量 | 必检内容 |
|---|---:|---|
| G01–G08 | 8 | 无合并、单行列标题、空标题与空数据 |
| G09–G16 | 8 | `colspan=2/3`、header 分组、保留/复制策略 |
| G17–G24 | 8 | `rowspan=2/3`、明确 `scope=row`、跨行数据 |
| G25–G32 | 8 | 行列同时合并、多个候选拆分、最小代价排序 |
| G33–G40 | 8 | CJK、`|`、反斜杠、Unicode、引号、实体、空白正规化 |
| G41–G48 | 8 | 嵌套表、重叠、越界、`headers=`、rowgroup 等应拒绝样本 |
| G49 | 1 | 首尾 U+00A0 保留（`&nbsp;x&nbsp;`）、TS 与 Oracle 一致（FIX-03，R1 P2 #3） |

**Oracle：** Python 标准库参考实现，按同一书面接口契约独立开发；`compare`、`slotOwner`、`Cell`、`F_origin/F_repeat`、碰撞证明逐项比较，49/49 全部一致为门槛。独立实验者的 Python/TS 各自独立生成随机种子但使用同一固定输入 JSON；至少 200 个有效合成随机种子，逐案无不一致；必须由不同施工/审查会话运行并保存真实退出码。

### 7.2 E2E 与真实环境门槛

- 真实虚拟机上 `npm ci; npm run typecheck; npm test; npm run build; npm run test:e2e` 均退出 0；日志含实际版本、命令、时间、运行路径。
- Playwright Chromium 至少 12 条交互：4 预设 × 正常和异常状态、两策略切换、输入编辑、复制、导出、取消/竞态、清空数据、窄屏与键盘焦点。
- 32×12 合法表运行 30 次记录耗时分位数；目标 p95 <=500ms，由 Muse 核对实跑，不做虚构跑分。
- 离线检查：阻断浏览器所有远程请求后仍可运行，敏感示例可见、可改、可删；无 localStorage/IndexedDB 写入，清空后内存/DOM 不再显示原值。
- `PROJECT_BOOK.md/.docx` 与 `IMPLEMENTATION_PLAN.md/.docx` 四文件必齐并内容一致后才允许施工；T014 审查文件清单、源 ZIP 原始 SHA256 和 `REVIEW_INDEX.md`，需要时生成分包全文 `REVIEW_PACK_XX.md`。

### 7.3 合成证据的真实含义

Golden 证明规则逻辑；固定随机种子证明稳定性；截图证明 UI 真实显示过；外部 GitHub issue 证明存在相关工程场景。它们**不能**证明中文用户使用频率、模型实际理解程度、节省时间、公司收购可能性。只要没有真实独立测试或复现日志，验收项一律写 `NOT_RUN`。

## 8. 隐私、安全与许可证

- 输入可在浏览器展示、在 textarea 中编辑和通过 `清空内存` 删除；默认无 cookie、无 telemetry、无后台上传、无远程字体/API。合成测试仓库内禁止放私人真实办公文档。
- 对 HTML 原文只作文本解析，不将用户原文 `innerHTML` 注入活页面；单元格显示使用 `textContent` / React 文本节点；禁止不受控 HTML/CSS/JS 执行和任意 URL 请求。
- 浏览器严格 CSP（`default-src 'self'`，不允许远程脚本、网络 API），构建输出静态包可离线服务；如 CSP 与 Worker 兼容性有差异，T012 真实测试记录差异。
- 自有代码 MIT；第三方依赖如 React、Vite、TypeScript、测试工具按实际 lockfile 核对 SPDX，交付 `THIRD_PARTY_NOTICES.md`。不直接搬用他人图标、示例图、未许可论文图片或源代码。
- 该产品不存个人敏感数据映射，不主动访问 clipboard 内容；导出仅用户手动触发。JSON 报告中的原文可能敏感，应显示导出提示，由用户决定是否保存。

## 9. 技术栈、架构及模块边界

**技术家族：** Node.js T001 实测 LTS 版本（默认目标 24.x）、TypeScript 5.x、React 19.x、Vite 7.x（若 T001 发现不兼容，记录 ADR 并冻结实测可用版本）、Vitest、Playwright、Python 3.12+（只用于独立 Oracle / 发布验证）。依赖和补丁版本均在 T001 `package-lock.json` 锁定；不凭空声明已安装、版本或 Windows 实跑。CPU 普通浏览器运行，不要求 GPU/LLM/服务端 API。

**单向数据流：** InputPanel → strict HTML parse/validation → canonical grid → two strategies → counterfactual split proof → Markdown comparison / header paths → Worker report → HTML/CSS/SVG UI → on-demand JSON/文本下载。所有报告具 `jobId + inputHash + specVersion`，撤销/换输入时丢弃旧结果。其中 `inputHash` 为输入 HTML 原文的 SHA-256（UTF-8 字节，十六进制小写）；`jobId` 由调用方传入，同一 `jobId` 只对应一次分析。

**推荐文件归属：**

```text
P029-tablefork/
  package.json package-lock.json tsconfig.json vite.config.ts playwright.config.ts
  README.md LICENSE THIRD_PARTY_NOTICES.md SECURITY.md
  src/core/{types,parse,grid,headers,flatten,witness,compare,records,report,index}.ts
  src/worker/{protocol,tablefork.worker}.ts
  src/ui/{App,InputPanel,DualTableView,MarkdownPanel,ProofPanel,ExportPanel}.tsx
  src/ui/styles.css src/data/presets.ts src/main.tsx
  cli/analyze.ts
  oracle/reference.py oracle/golden_expected.json
  fixtures/{TFK-A,TFK-B,TFK-C,TFK-D}.json
  tests/{core,property,e2e}/
  docs/{PROJECT_BOOK,IMPLEMENTATION_PLAN}.md
  review/{REVIEW_INDEX,REVIEW_PACK_01,REVIEW_PACK_02}.md
  artifacts/{reports,screenshots,logs,release}/
```

工程任务归属、接口冻结、审查和发布门槛详见完整 `IMPLEMENTATION_PLAN.md`；Muse 自身只调度，不编写业务代码。

## 10. 传播与商业扩展仅作假设

**README 演示核心：** GIF/截图左侧两张明显合并方式不同的表，中央一个完全相同的 Markdown，右侧一张有原始标题路径的交接稿。任何读 README 的开发者只需一眼理解“表面上一个 Markdown，来源可以有两个”，可以下载运行 `npm ci && npm run dev`。

**GitHub 潜力**（规划评分 4.8/5）：受众可扩展到 DOC→RAG 开发团队，但当前只展示很窄的 HTML 子集；高星是目标，不是预测。

**收购/产品化潜力**（规划评分 4.4/5）：未来可做文档解析流水线的结构保真门禁，输出可核验报告；**当前 MVP 不提供 API 服务，也没有公司兴趣/估值/交易证据**。若 88 小时原型不能稳定给出碰撞反例与报告，即停止扩展。

## 11. 最终交付件及终审唯一门槛

1. 四份规格实体：`PROJECT_BOOK.md`、`PROJECT_BOOK.docx`、`IMPLEMENTATION_PLAN.md`、`IMPLEMENTATION_PLAN.docx`，两种格式章节及表格语义一致。
2. 本地源码、`package-lock.json`、MIT LICENSE、第三方许可清单、README、无网运行指引。
3. 49 Golden 的手写预期数据、Python 独立 Oracle、200 种子 property、单元/端到端测试日志及截图。
4. 静态 build、CLI、至少四个合成案例、可下载 `tablefork.report/v1` 报告。
5. 发布包 ZIP 的 SHA-256、源码树清单、Git commit（若真实存在）、`REVIEW_INDEX.md`、完整代码 `REVIEW_PACK_XX.md`、任务审查记录和终审报告。
6. Google Drive `agent project auto/P029-tablefork/` 实际上传并回读验证，四文件链接和文件夹链接供 ChatGPT 项目来源使用；已于 2026-11-20 上传 Drive 并回读核实（P029_SPEC_BUNDLE.zip MD5 一致，5 文件 SHA-256 全对）。
7. 同一 P029 立项对话接受独立终审：`FINAL_VERDICT: PASS` 才能发布完成通知；超过 5 轮仍未过，开“表歧镜 终审续审”附完整历史。

## 12. 参考网址清单（均为可查入口）

- 2026 GitHub Trending `markitdown`: https://githubtrending.today/repo/microsoft/markitdown/
- Microsoft MarkItDown: https://github.com/microsoft/markitdown
- Docling Issue #3830: https://github.com/docling-project/docling/issues/3830
- Docling 官方序列化说明: https://docling-project.github.io/docling/concepts/serialization/
- table2rules: https://github.com/PebbleRoad/table2rules
- html-table-rescuer: https://github.com/Encephos/html-table-rescuer
- HTML Living Standard: https://html.spec.whatwg.org/multipage/tables.html
- RealHiTBench: https://arxiv.org/abs/2506.13405
- LTEM: https://arxiv.org/abs/2610.29188
- OHD: https://proceedings.mlr.press/v306/cao26p.html
- Stack Overflow 2026 信任调查: https://survey.stackoverflow.co/2026/ai/data/ai-trust
- 工厂项目索引: https://drive.google.com/file/d/1qHHIqtkjZMd96A7mcTOCmDhUhcxSZO_n/view

**本书任何测试数、性能门槛及产物形态均为要求，不是已实现或已通过的事实。**
