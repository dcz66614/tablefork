/**
 * P029 TableFork — 核心公共出口 (P029-T002 主控，P029-T013 挂载)
 *
 * 后续任务（T003–T014、CLI、UI）一律从这里 import 公共类型 / 枚举 / 常量 / Worker 协议，
 * 不得各自猜字段、不得绕过本文件直接深 import 后再改口径。
 *
 * 本文件只做 re-export，不放任何实现。T013 已按本文件头原注把全部核心模块
 * 一次性挂到本出口（records/report/compare/witness/parse/grid/headers/
 * flatten/sha256 + T002 冻结的契约 + Worker 协议）；挂载后 typecheck +
 * build + 全测试全绿（见 artifacts/logs/T013-release.txt）。
 *
 * 去重口径（挂载时唯一需要裁决的点，行为零改动）：
 * - sha256Utf8 只从 ./sha256 导出一次：witness.ts 与 report.ts 只是
 *   re-export 同一实现，多处导出会造成歧义导出，改由本文件统一出口。
 * - isTableForkError 只从 ./types 导出一次：report.ts 只是 re-export
 *   同一函数，同样归一到 types。
 * 其余各模块导出名无冲突，全数挂载，不省略、不改名。
 */

export type {
  AnalyzeInput,
  AnalyzeResult,
  Cell,
  CollisionKind,
  CollisionProof,
  CompareStatus,
  ErrorCode,
  HeaderStatus,
  SlotFact,
  Strategy,
  TableForkError,
  WitnessStatus,
} from './types';
export {
  ERROR_CODES,
  INPUT_SCHEMA,
  MAX_COLS,
  MAX_DOM_CELLS,
  MAX_INPUT_BYTES,
  MAX_ROWS,
  MAX_SPAN,
  REPORT_SCHEMA,
  SPEC_VERSION,
  isTableForkError,
} from './types';

// parse.ts（T003）：严格限定 HTML 解析与输入校验。
export {
  TableForkInputError,
  decodeEntities,
  fail,
  normalizeCellText,
  parseValidatedTable,
} from './parse';
export type { ParsedCell, ParsedRow, ParsedTable, ParseOptions } from './parse';

// grid.ts（T003）：覆盖网格。
export { buildGrid } from './grid';
export type { GridResult } from './grid';

// headers.ts（T003）：明示标题路径。
export { buildHeaderPaths, headerStatusFor } from './headers';
export type { SlotHeaderPaths } from './headers';

// flatten.ts（T004）：双策略 Markdown 投影。
export {
  escapeMarkdownCell,
  flattenGrid,
  flattenOriginEmpty,
  flattenRepeatValue,
} from './flatten';

// witness.ts（T005）：单格拆分与反事实碰撞证明。
export {
  buildAlternativeHtml,
  canonicalCellGraph,
  collisionKindOf,
  findWitness,
  headerPathsChanged,
  splitCost,
  utf8BytesEqual,
} from './witness';
export type { WitnessResult } from './witness';

// compare.ts（T007）：用户 Markdown 严格对账。
export { compareMarkdown, detectGfmPipeTable } from './compare';
export type {
  CompareResult,
  FirstDiff,
  GfmCheckResult,
  GfmTableStatus,
} from './compare';

// records.ts（T008）：逐槽来源证据。
export {
  UNKNOWN_TITLE,
  buildSlotFacts,
  formatSlotFact,
  formatSlotFacts,
} from './records';

// report.ts（T008）：公共浏览器内核与结果 JSON。
export { analyze, sha256Utf8WebCrypto } from './report';

// sha256.ts（T009-FIX-01）：浏览器安全同步 SHA-256（FIPS 180-4）。
// 本文件是 sha256Utf8 的唯一出口（见文件头去重口径）。
export { sha256Utf8 } from './sha256';

export type {
  AnalyzeRequestMessage,
  CancelMessage,
  WorkerErrorMessage,
  WorkerMessage,
  WorkerRequestMessage,
  WorkerResponseMessage,
  WorkerResultMessage,
} from '../worker/protocol';
export { isWorkerRequestMessage, isWorkerResponseMessage } from '../worker/protocol';
