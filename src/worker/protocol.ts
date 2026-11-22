/**
 * P029 TableFork — Worker 协议 (P029-T002)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §6.2、IMPLEMENTATION_PLAN.md §4.2。
 *
 * 请求（主线程 -> Worker）：
 *   { jobId, type: 'ANALYZE', payload: AnalyzeInput }
 *   { jobId, type: 'CANCEL' }
 * 回复（Worker -> 主线程）：
 *   { jobId, type: 'RESULT', data: AnalyzeResult }
 *   { jobId, type: 'ERROR', code: ErrorCode, message: string }
 *
 * 合同要点：
 * - 主线程仅采纳 jobId 与最新输入版本完全一致的结果；取消不覆盖新结果。
 * - ERROR 的 code 必须是 ErrorCode 枚举之一（见 src/core/types.ts）。
 * - 本文件只定义消息形状与类型守卫，不含 Worker 实现（tablefork.worker.ts 是 T010 的活）。
 */

import type { AnalyzeInput, AnalyzeResult, ErrorCode } from '../core/types';

/** 请求 Worker 分析一份输入。payload.schema 必须是 'tablefork.input/v1'。 */
export interface AnalyzeRequestMessage {
  jobId: string;
  type: 'ANALYZE';
  payload: AnalyzeInput;
}

/** 取消一个在途任务。取消后该 jobId 不得再产生 RESULT/ERROR 覆盖新输入的结果。 */
export interface CancelMessage {
  jobId: string;
  type: 'CANCEL';
}

/** 主线程 -> Worker 的全部消息。 */
export type WorkerRequestMessage = AnalyzeRequestMessage | CancelMessage;

/** Worker 分析成功，返回一份 schema 为 'tablefork.report/v1' 的报告。 */
export interface WorkerResultMessage {
  jobId: string;
  type: 'RESULT';
  data: AnalyzeResult;
}

/** Worker 分析失败（无效输入 / 不支持 / 取消 / 超限）。code 为枚举错误码。 */
export interface WorkerErrorMessage {
  jobId: string;
  type: 'ERROR';
  code: ErrorCode;
  message: string;
}

/** Worker -> 主线程的全部消息。 */
export type WorkerResponseMessage = WorkerResultMessage | WorkerErrorMessage;

/** 双向全部 Worker 消息（请求 + 回复）。 */
export type WorkerMessage = WorkerRequestMessage | WorkerResponseMessage;

/** 判定未知值是否为发往 Worker 的请求消息（ANALYZE 带 payload，CANCEL 不带）。 */
export function isWorkerRequestMessage(value: unknown): value is WorkerRequestMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { jobId?: unknown; type?: unknown; payload?: unknown };
  if (typeof candidate.jobId !== 'string') {
    return false;
  }
  if (candidate.type === 'CANCEL') {
    return true;
  }
  return (
    candidate.type === 'ANALYZE' &&
    typeof candidate.payload === 'object' &&
    candidate.payload !== null
  );
}

/** 判定未知值是否为 Worker 发回的回复消息（RESULT 带 data，ERROR 带枚举 code）。 */
export function isWorkerResponseMessage(value: unknown): value is WorkerResponseMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as {
    jobId?: unknown;
    type?: unknown;
    data?: unknown;
    code?: unknown;
    message?: unknown;
  };
  if (typeof candidate.jobId !== 'string') {
    return false;
  }
  if (candidate.type === 'RESULT') {
    return typeof candidate.data === 'object' && candidate.data !== null;
  }
  return (
    candidate.type === 'ERROR' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string'
  );
}
