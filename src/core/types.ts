/**
 * P029 TableFork — 冻结数据契约 (P029-T002)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §6.1（核心类型）、§5.5 / §4.2（错误枚举）、§3.1（输入上限）。
 * 本文件只含类型、常量与错误载体，不含任何网格/解析/序列化算法（那是 T003–T005 的活）。
 * 字段与 §6.1 一字不差；超出 §6.1 的补充（错误载体、schema 常量、输入上限常量、
 * 碰撞种类）均在 artifacts/logs/T002-contract.txt 中逐项登记为“补充”，不得悄悄改规格。
 *
 * 约定：
 * - 源格坐标从 0 开始；cellId 按原点行、原点列、DOM 序稳定排序（c00, c01, ...）。
 * - 标题路径为数组；缺失标题时对应路径为空数组，headerStatus 为 'UNKNOWN'，不得编造。
 * - 数值一律以 string 携带，绝不解析为 JS Number（避免 17 位 ID 精度损坏，见计划 §4.2）。
 */

export type Strategy = 'ORIGIN_EMPTY' | 'REPEAT_VALUE';

export type HeaderStatus = 'KNOWN' | 'UNKNOWN';

export type CompareStatus = 'EXACT_MATCH' | 'EXACT_DIFF' | 'NOT_SUPPLIED';

export type WitnessStatus = 'CERTIFIED_COLLISION' | 'NO_WITNESS_FOUND' | 'UNSUPPORTED';

export interface Cell {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  role: 'TH' | 'TD';
  scope: 'row' | 'col' | null;
  text: string;
  section: 'thead' | 'tbody';
}

export interface SlotFact {
  row: number;
  col: number;
  cellId: string;
  rowHeaders: string[];
  colHeaders: string[];
  headerStatus: HeaderStatus;
  value: string;
}

export interface AnalyzeInput {
  schema: 'tablefork.input/v1';
  html: string;
  suppliedMarkdown?: string;
  strategy: Strategy;
}

export interface CollisionProof {
  sourceCellId: string;
  alternativeHtml: string;
  aGraphSha256: string;
  bGraphSha256: string;
  markdownSha256: string;
  splitCost: number;
  headerAssociationChanged: boolean;
}

export interface AnalyzeResult {
  schema: 'tablefork.report/v1';
  jobId: string;
  inputHash: string;
  specVersion: string;
  compare: CompareStatus;
  witness: WitnessStatus;
  canonicalMarkdown: string;
  facts: SlotFact[];
  proof?: CollisionProof;
  warnings: string[];
}

/**
 * 冻结 schema 字面量（项目书 §6.2 / 计划 §4.2）。
 * AnalyzeInput.schema 必须是 'tablefork.input/v1'，报告必须是 'tablefork.report/v1'；
 * 未来不兼容更改必须提高 major。
 */
export const INPUT_SCHEMA = 'tablefork.input/v1' as const;
export const REPORT_SCHEMA = 'tablefork.report/v1' as const;

/** 冻结规格版本（项目书封面 SPEC_VERSION 1.0.2；报告携带 specVersion，见项目书 §9）。 */
export const SPEC_VERSION = '1.0.2' as const;

/**
 * 冻结输入上限（项目书 §3.1）。数值单位：字节为 UTF-8 字节数。
 * 超出上限的输入直接显式拒绝（OVER_SIZE / INVALID_SPAN），不进入二次修复或猜测分支。
 */
export const MAX_INPUT_BYTES = 64 * 1024;
export const MAX_ROWS = 32;
export const MAX_COLS = 12;
export const MAX_DOM_CELLS = 128;
export const MAX_SPAN = 8;

/**
 * API / Worker 错误码枚举（项目书 §5.5、§4.2、计划 §4.2）。
 * 全部 7 个，缺一不可；对无效表只报枚举错误，不返回误导性的分析结果。
 */
export type ErrorCode =
  | 'INVALID_SPAN'
  | 'INVALID_GRID_OVERLAP'
  | 'INVALID_RAGGED_GRID'
  | 'OVER_SIZE'
  | 'UNSUPPORTED_NESTED_TABLE'
  | 'UNSUPPORTED_HEADER_SEMANTICS'
  | 'CANCELLED';

/** 全部 7 个错误码的只读清单（供穷尽检查与测试枚举；顺序与 ErrorCode 定义一致）。 */
export const ERROR_CODES: readonly ErrorCode[] = [
  'INVALID_SPAN',
  'INVALID_GRID_OVERLAP',
  'INVALID_RAGGED_GRID',
  'OVER_SIZE',
  'UNSUPPORTED_NESTED_TABLE',
  'UNSUPPORTED_HEADER_SEMANTICS',
  'CANCELLED',
] as const;

/**
 * 结构化错误载体（补充，§6.1 未定义；仅为“报枚举错误”提供统一形状）。
 * 实现层（parse/grid/worker）抛错或回 ERROR 消息时使用此形状：
 * code 必须是 ErrorCode 之一，message 为人类可读说明（含行列定位时写明坐标）。
 */
export interface TableForkError {
  code: ErrorCode;
  message: string;
}

/** 判定一个未知值是否为 TableForkError 形状（code 在枚举内且 message 为字符串）。 */
export function isTableForkError(value: unknown): value is TableForkError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { code?: unknown; message?: unknown };
  return (
    typeof candidate.message === 'string' &&
    typeof candidate.code === 'string' &&
    (ERROR_CODES as readonly string[]).includes(candidate.code)
  );
}

/**
 * 碰撞种类标签（补充；项目书 §5.2 / §4.2 的两行断言标签）。
 * 仅当 proof.headerAssociationChanged 为 true 时取 'HEADER_ASSOCIATION_CHANGED'，
 * 否则只说 'STRUCTURAL_COLLISION'；标题未知时不得推测“改变”。
 */
export type CollisionKind = 'HEADER_ASSOCIATION_CHANGED' | 'STRUCTURAL_COLLISION';
