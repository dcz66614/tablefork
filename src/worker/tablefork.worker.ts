/**
 * P029 TableFork — 唯一 Worker (P029-T010)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §6.2（Worker 协议 jobId 合同）、
 * IMPLEMENTATION_PLAN.md §4.2（JSON 与 worker 失败合同）、
 * src/worker/protocol.ts（消息形状与类型守卫，只读）。
 *
 * 协议：
 * - 收 { jobId, type: 'ANALYZE', payload } → 调公共内核 analyze()
 *   回 { jobId, type: 'RESULT', data }；无效输入回
 *   { jobId, type: 'ERROR', code, message }，code 必须是 ErrorCode 枚举之一。
 * - 收 { jobId, type: 'CANCEL' } → 取消在途任务：该 jobId 此后不得再产生
 *   RESULT/ERROR；已排队但未执行的同 jobId 分析也被压住。
 * - 连续两个 ANALYZE：只有最新 job 的结果被采纳（版本号守卫，见 J-T010-2）。
 *
 * 本文件是全项目唯一的 Worker 文件（DoD：禁止偷偷加入额外 Worker）。
 * UI 接入 Worker 是 T013 的集成任务；本卡不改 src/ui/* 与 src/main.tsx，
 * UI 目前在主线程直调 analyze() 的现状保持不变。
 */

import { analyze } from '../core/report';
import {
  ERROR_CODES,
  isTableForkError,
  type ErrorCode,
} from '../core/types';
import type { WorkerResponseMessage } from './protocol';

/** Worker 回复的投递口（浏览器里是 self.postMessage；测试里是收集函数）。 */
export type WorkerPostMessage = (message: WorkerResponseMessage) => void;

/**
 * 一个 ANALYZE 请求在入队后、执行前的让步：把分析推迟到下一个
 * macrotask 再执行。见 J-T010-2。
 */
function yieldToMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * 创建一个纯函数消息处理器（不依赖 DOM/Worker 全局，便于 Vitest 测试）。
 *
 * 每次调用返回的处理器自带独立状态（最新 jobId、版本号、已取消集合），
 * 多个处理器之间互不干扰；浏览器接线只创建一个（见文件底部）。
 *
 * @param postMessage 回复投递口；处理器只通过它发 RESULT/ERROR，绝不
 *   直接碰 self / postMessage 全局。
 * @returns 异步消息处理函数：对每条入站消息返回 Promise<void>。
 */
export function createWorkerMessageHandler(
  postMessage: WorkerPostMessage,
): (message: unknown) => Promise<void> {
  /** 最新 ANALYZE 的 jobId；RESULT/ERROR 只当 jobId 仍是它时才投递。 */
  let latestJobId: string | null = null;
  /** 每次 ANALYZE 递增的版本号；入队时快照，执行后比对，旧版本丢弃。 */
  let latestGeneration = 0;
  /** 已取消的 jobId；CANCEL 后该 jobId 不得再产生 RESULT/ERROR。 */
  const cancelled = new Set<string>();

  /** 只有 job 仍是最新且未被取消时才投递回复；否则静默丢弃。 */
  function postIfCurrent(
    jobId: string,
    generation: number,
    message: WorkerResponseMessage,
  ): void {
    if (generation !== latestGeneration) {
      return;
    }
    if (jobId !== latestJobId) {
      return;
    }
    if (cancelled.has(jobId)) {
      return;
    }
    postMessage(message);
  }

  return async function handleWorkerMessage(message: unknown): Promise<void> {
    if (typeof message !== 'object' || message === null) {
      // 没有 jobId 可回：无处投递，按协议静默丢弃（不抛错、不回消息）。
      return;
    }
    const candidate = message as { jobId?: unknown; type?: unknown; payload?: unknown };
    if (typeof candidate.jobId !== 'string' || candidate.jobId === '') {
      // 同上：jobId 不是非空字符串，无法按协议回 ERROR，静默丢弃。
      return;
    }
    const jobId: string = candidate.jobId;

    if (candidate.type === 'CANCEL') {
      // 取消是同步生效的：立即登记。版本号只在取消的正是当前最新 job
      // 时才 +1（使已入队未执行的它在执行后被守卫丢弃）；取消一个
      // 早已被取代的旧 job 时绝不碰版本号，否则会误杀最新 job 的结果。
      cancelled.add(jobId);
      if (latestJobId === jobId) {
        latestGeneration += 1;
        latestJobId = null;
      }
      return;
    }

    if (candidate.type !== 'ANALYZE') {
      // 未知 type：按无效输入回 ERROR（jobId 已知，code 用兜底桶，见 J-T010-1）。
      postMessage({
        jobId,
        type: 'ERROR',
        code: 'INVALID_RAGGED_GRID',
        message: `worker: unknown message type ${JSON.stringify(candidate.type)}`,
      });
      return;
    }

    // ANALYZE：登记为最新 job，清空该 jobId 的旧取消记录（jobId 复用时，
    // 新的分析不应被上一轮的 CANCEL 压住），快照版本号，然后让步。
    latestJobId = jobId;
    latestGeneration += 1;
    const generation = latestGeneration;
    cancelled.delete(jobId);

    // J-T010-2：让步一个 macrotask 再执行 analyze()。analyze() 本身是
    // 同步完成的 async 函数（体内无 await）；若不让步，RESULT 会在同
    // 一个 microtask 检查点发出，抢在随后到达的 CANCEL / 新 ANALYZE
    // 之前，使取消与竞态守卫在真实浏览器里永远观测不到。让步后，
    // 同一任务里接连 post 的 CANCEL / ANALYZE 先被处理，旧 job 在
    // 执行后被版本号守卫或取消集合压住。代价约 1 个定时器 tick。
    await yieldToMacrotask();

    // 让步后再次确认：若期间被取消或被更新的 ANALYZE 取代，直接返回，
    // 不执行 analyze()（省一次无用计算，也保证不产生任何回复）。
    if (generation !== latestGeneration || jobId !== latestJobId) {
      return;
    }
    if (cancelled.has(jobId)) {
      return;
    }

    try {
      // analyze() 自身做 schema/strategy/html 校验并抛 TableForkError；
      // payload 缺失/非对象时它同样抛错（failInput），不需在此另行校验。
      // FIX-02：传消息外层的 jobId 作 analyze() 第二参数——RESULT 的
      // data.jobId 与外层 jobId 一致（项目书 §9），且 jobId 为必填，
      // 不传空串（analyze 内 fail-closed 校验）。
      const data = await analyze(
        candidate.payload as Parameters<typeof analyze>[0],
        jobId,
      );
      postIfCurrent(jobId, generation, { jobId, type: 'RESULT', data });
    } catch (error: unknown) {
      if (isTableForkError(error)) {
        postIfCurrent(jobId, generation, {
          jobId,
          type: 'ERROR',
          code: error.code,
          message: error.message,
        });
        return;
      }
      // 非 TableForkError（内部不一致，如 analyze 的哈希复核抛普通 Error）：
      // 冻结枚举里没有 INTERNAL 码，沿用 J-T008-2 的兜底桶口径报
      // INVALID_RAGGED_GRID，消息正文写明这是内部错误而非输入问题。
      const message =
        error instanceof Error ? error.message : String(error);
      postIfCurrent(jobId, generation, {
        jobId,
        type: 'ERROR',
        code: 'INVALID_RAGGED_GRID',
        message: `worker: internal error (not an input error): ${message}`,
      });
    }
  };
}

/** 全部 7 个错误码的只读清单（供调用方/测试穷尽检查；与 types.ts 一致）。 */
export { ERROR_CODES };
export type { ErrorCode };

/**
 * 浏览器接线（文件底部唯一碰 self 的地方）。
 *
 * `typeof self !== 'undefined'` 守卫使本模块在 Node/Vitest 里 import 时
 * 不接线（Node 里 self 未定义）；再加 postMessage 是函数的检查，防止
 * 在非 Worker 的浏览器主线程环境里误挂 onmessage。真实 Worker 里
 * self.postMessage 存在，接线生效。
 */
if (
  typeof self !== 'undefined' &&
  typeof (self as unknown as { postMessage?: unknown }).postMessage ===
    'function'
) {
  const workerSelf = self as unknown as {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
    postMessage: (message: WorkerResponseMessage) => void;
  };
  const handleMessage = createWorkerMessageHandler((message) =>
    workerSelf.postMessage(message),
  );
  workerSelf.onmessage = (event: MessageEvent<unknown>) => {
    void handleMessage(event.data);
  };
}
