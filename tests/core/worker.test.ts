/**
 * P029-T011 formal test — taken over from the P029-T010 temporary test.
 *
 * 本文件是 P029-T010 的正式测试（P029-T011 接管，全部断言保留）：覆盖 src/worker/tablefork.worker.ts
 * （纯函数消息处理器 createWorkerMessageHandler）与 fixtures/TFK-A..D.json
 * （经 CLI 与 Worker 的一致性）。正式的 49 Golden（fixtures/golden +
 * tests/core + tests/property）由 T011 接管；本文件不声称测试已完备，
 * T011 接管时可替换或并入正式套件。
 *
 * 覆盖要点（见 artifacts/logs/T010-worker-cli.txt §2/§5/§7）：
 * - ANALYZE 得 RESULT，且与直接调 analyze() 的结果逐字段 deep-equal
 *   （Worker 与 CLI 走同一个 src/core 内核；CLI 文件侧的逐字段比对见
 *   日志 §3，由 /tmp 浏览器脚本对 artifacts/reports/TFK-*.json 实测）。
 * - 无效输入得 ERROR，且 code 为 ErrorCode 枚举值（T008 J-T008-2 的
 *   兜底桶口径：analyze 入口校验失败报 INVALID_RAGGED_GRID）。
 * - CANCEL 后旧 job 无 RESULT/ERROR；连续两个 ANALYZE 只有最新 job 的
 *   结果被采纳（版本号守卫）；取消一个已被取代的旧 job 不误杀最新 job。
 * - 全项目只有一个 Worker 文件（src/worker 下仅 protocol.ts 与
 *   tablefork.worker.ts），DoD 的一部分。
 *
 * 所有期望值均为手算或取自已钉死的旧日志（T005/T008/T009 的哈希），
 * 未从被测实现复制。Worker 处理器在让步一个 macrotask 后才执行
 * analyze()（J-T010-2），测试里 await 处理器 Promise 即足以等到投递。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/core/report';
import { ERROR_CODES, SPEC_VERSION, type AnalyzeInput } from '../../src/core/types';
import { sha256Utf8 } from '../../src/core/witness';
import { PRESETS } from '../../src/ui/presets';
import {
  createWorkerMessageHandler,
  type WorkerResponseMessage,
} from '../../src/worker/tablefork.worker';

/** 收集投递的回复；每个测试用独立处理器（独立状态，互不干扰）。 */
function makeCollector(): {
  messages: WorkerResponseMessage[];
  handle: (message: unknown) => Promise<void>;
} {
  const messages: WorkerResponseMessage[] = [];
  const handle = createWorkerMessageHandler((message) => {
    messages.push(message);
  });
  return { messages, handle };
}

/** 由 fixture 文件读 AnalyzeInput（fixture 与 presets.ts 同源，见日志 §4）。 */
function fixtureInput(id: string): AnalyzeInput {
  const fixture = JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), `../../fixtures/${id}.json`),
      'utf8',
    ) as string,
  ) as {
    input: AnalyzeInput;
  };
  return fixture.input;
}

describe('P029-T010 worker message handler', () => {
  it('ANALYZE TFK-A: RESULT deep-equal to direct analyze() (field by field)', async () => {
    const { messages, handle } = makeCollector();
    await handle({
      jobId: 'job-a',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-A'),
    });
    expect(messages).toHaveLength(1);
    const reply = messages[0];
    expect(reply?.type).toBe('RESULT');
    expect(reply?.jobId).toBe('job-a');
    if (reply?.type !== 'RESULT') {
      throw new Error('expected RESULT');
    }
    const direct = await analyze(fixtureInput('TFK-A'), 'job-a');
    expect(reply.data).toEqual(direct);
    // FIX-02：Worker 传消息外层 jobId，RESULT 的 data.jobId 与外层一致；
    // inputHash 为输入 HTML 原文的 SHA-256，specVersion 为 SPEC_VERSION。
    expect(reply.data.jobId).toBe('job-a');
    expect(reply.data.inputHash).toBe(sha256Utf8(fixtureInput('TFK-A').html));
    expect(reply.data.specVersion).toBe('1.0.2');
    expect(reply.data.specVersion).toBe(SPEC_VERSION);
    // 逐字段点名（T005/T008 已钉死的哈希，不是从实现复制的）：
    expect(reply.data.schema).toBe('tablefork.report/v1');
    expect(reply.data.compare).toBe('NOT_SUPPLIED');
    expect(reply.data.witness).toBe('CERTIFIED_COLLISION');
    expect(reply.data.proof?.sourceCellId).toBe('c01');
    expect(reply.data.proof?.splitCost).toBe(1);
    expect(reply.data.proof?.headerAssociationChanged).toBe(true);
    expect(reply.data.proof?.aGraphSha256).toBe(
      'dbd4b9cebec9a13f40cfdff378c78d1f59325cdc0e721faa0b4068eb90de157d',
    );
    expect(reply.data.proof?.bGraphSha256).toBe(
      'a9ec182caf420715248a255286d2daef973a8e22719691db813dd05d88238bc5',
    );
    expect(reply.data.proof?.markdownSha256).toBe(
      '83da510440918640ba87eff47fa11cad70444955f6ce7e36724e4d26765338c1',
    );
    expect(reply.data.facts).toHaveLength(3);
  });

  it('ANALYZE TFK-B: CERTIFIED_COLLISION, source c02, header changed', async () => {
    const { messages, handle } = makeCollector();
    await handle({
      jobId: 'job-b',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-B'),
    });
    expect(messages).toHaveLength(1);
    const reply = messages[0];
    expect(reply?.type).toBe('RESULT');
    if (reply?.type !== 'RESULT') {
      throw new Error('expected RESULT');
    }
    expect(reply.data.witness).toBe('CERTIFIED_COLLISION');
    expect(reply.data.proof?.sourceCellId).toBe('c02');
    expect(reply.data.proof?.headerAssociationChanged).toBe(true);
    // T009 已钉死的 TFK-B ORIGIN_EMPTY 哈希前缀（全值见日志 §3）：
    expect(reply.data.proof?.markdownSha256.startsWith('07ee8352')).toBe(true);
    expect(reply.data.proof?.aGraphSha256.startsWith('7671d3ba')).toBe(true);
    expect(reply.data.jobId).toBe('job-b');
    expect(reply.data.inputHash).toBe(sha256Utf8(fixtureInput('TFK-B').html));
    expect(reply.data.specVersion).toBe('1.0.2');
    expect(reply.data).toEqual(await analyze(fixtureInput('TFK-B'), 'job-b'));
  });

  it('ANALYZE TFK-C: NO_WITNESS_FOUND, proof field omitted', async () => {
    const { messages, handle } = makeCollector();
    await handle({
      jobId: 'job-c',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-C'),
    });
    expect(messages).toHaveLength(1);
    const reply = messages[0];
    expect(reply?.type).toBe('RESULT');
    if (reply?.type !== 'RESULT') {
      throw new Error('expected RESULT');
    }
    expect(reply.data.witness).toBe('NO_WITNESS_FOUND');
    expect('proof' in reply.data).toBe(false);
    expect(reply.data.jobId).toBe('job-c');
    expect(reply.data.inputHash).toBe(sha256Utf8(fixtureInput('TFK-C').html));
    expect(reply.data.specVersion).toBe('1.0.2');
    expect(reply.data).toEqual(await analyze(fixtureInput('TFK-C'), 'job-c'));
  });

  it('ANALYZE TFK-D: ERROR UNSUPPORTED_HEADER_SEMANTICS (enum code)', async () => {
    const { messages, handle } = makeCollector();
    await handle({
      jobId: 'job-d',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-D'),
    });
    expect(messages).toHaveLength(1);
    const reply = messages[0];
    expect(reply?.type).toBe('ERROR');
    if (reply?.type !== 'ERROR') {
      throw new Error('expected ERROR');
    }
    expect(reply.code).toBe('UNSUPPORTED_HEADER_SEMANTICS');
    expect(ERROR_CODES).toContain(reply.code);
    expect(typeof reply.message).toBe('string');
  });

  it('invalid inputs: ERROR with an ErrorCode enum value, never a RESULT', async () => {
    const cases: Array<{ name: string; payload: unknown; code: string }> = [
      {
        name: 'bad schema',
        payload: {
          schema: 'tablefork.input/v2',
          html: '<table><tbody><tr><td>a</td></tr></tbody></table>',
          strategy: 'ORIGIN_EMPTY',
        },
        code: 'INVALID_RAGGED_GRID',
      },
      {
        name: 'bad strategy',
        payload: {
          schema: 'tablefork.input/v1',
          html: '<table><tbody><tr><td>a</td></tr></tbody></table>',
          strategy: 'NOPE',
        },
        code: 'INVALID_RAGGED_GRID',
      },
      {
        name: 'nested table',
        payload: {
          schema: 'tablefork.input/v1',
          html: '<table><tbody><tr><td><table><tr><td>x</td></tr></table></td></tr></tbody></table>',
          strategy: 'ORIGIN_EMPTY',
        },
        code: 'UNSUPPORTED_NESTED_TABLE',
      },
      {
        name: 'missing payload',
        payload: undefined,
        code: 'INVALID_RAGGED_GRID',
      },
    ];
    for (const [index, testCase] of cases.entries()) {
      const { messages, handle } = makeCollector();
      await handle({
        jobId: `job-invalid-${index}`,
        type: 'ANALYZE',
        payload: testCase.payload,
      });
      expect(messages).toHaveLength(1);
      const reply = messages[0];
      expect(reply?.type).toBe('ERROR');
      if (reply?.type !== 'ERROR') {
        throw new Error(`expected ERROR for ${testCase.name}`);
      }
      expect(reply.code).toBe(testCase.code);
      expect(ERROR_CODES).toContain(reply.code);
    }
  });

  it('malformed messages without a usable jobId post nothing', async () => {
    const { messages, handle } = makeCollector();
    await handle(null);
    await handle('not-an-object');
    await handle({ type: 'ANALYZE', payload: fixtureInput('TFK-A') });
    await handle({ jobId: 42, type: 'ANALYZE', payload: fixtureInput('TFK-A') });
    await handle({ jobId: '', type: 'ANALYZE', payload: fixtureInput('TFK-A') });
    expect(messages).toHaveLength(0);
  });

  it('unknown message type: ERROR INVALID_RAGGED_GRID (catch-all bucket)', async () => {
    const { messages, handle } = makeCollector();
    await handle({ jobId: 'job-unknown', type: 'PING' });
    expect(messages).toHaveLength(1);
    const reply = messages[0];
    expect(reply?.type).toBe('ERROR');
    if (reply?.type !== 'ERROR') {
      throw new Error('expected ERROR');
    }
    expect(reply.code).toBe('INVALID_RAGGED_GRID');
  });

  it('CANCEL after ANALYZE: the old job produces no RESULT/ERROR', async () => {
    const { messages, handle } = makeCollector();
    const pending = handle({
      jobId: 'job-cancel',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-A'),
    });
    await handle({ jobId: 'job-cancel', type: 'CANCEL' });
    await pending;
    expect(messages).toHaveLength(0);
  });

  it('CANCEL of an unknown jobId posts nothing', async () => {
    const { messages, handle } = makeCollector();
    await handle({ jobId: 'job-never-seen', type: 'CANCEL' });
    expect(messages).toHaveLength(0);
  });

  it('two ANALYZEs back to back: only the latest job result is adopted', async () => {
    const { messages, handle } = makeCollector();
    const first = handle({
      jobId: 'job-old',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-A'),
    });
    const second = handle({
      jobId: 'job-new',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-B'),
    });
    await Promise.all([first, second]);
    expect(messages).toHaveLength(1);
    const reply = messages[0];
    expect(reply?.jobId).toBe('job-new');
    expect(reply?.type).toBe('RESULT');
    if (reply?.type !== 'RESULT') {
      throw new Error('expected RESULT');
    }
    expect(reply.data.proof?.sourceCellId).toBe('c02');
  });

  it('stale CANCEL of a superseded job does not kill the latest job', async () => {
    const { messages, handle } = makeCollector();
    const first = handle({
      jobId: 'job-old',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-A'),
    });
    const second = handle({
      jobId: 'job-new',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-B'),
    });
    await handle({ jobId: 'job-old', type: 'CANCEL' });
    await Promise.all([first, second]);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.jobId).toBe('job-new');
    expect(messages[0]?.type).toBe('RESULT');
  });

  it('fixtures reuse the preset HTML verbatim (single source: src/ui/presets.ts)', () => {
    for (const preset of PRESETS) {
      const fixture = JSON.parse(
        readFileSync(
          join(
            dirname(fileURLToPath(import.meta.url)),
            `../../fixtures/${preset.id}.json`,
          ),
          'utf8',
        ) as string,
      ) as { fixture_id: string; schema: string; input: AnalyzeInput };
      expect(fixture.fixture_id).toBe(preset.id);
      expect(fixture.schema).toBe('tablefork.fixture/v1');
      expect(fixture.input.html).toBe(preset.html);
      expect(fixture.input.strategy).toBe('ORIGIN_EMPTY');
    }
  });

  it('only one Worker file exists in src/worker (protocol + implementation)', () => {
    const workerDir = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../src/worker',
    );
    expect(readdirSync(workerDir).sort()).toEqual([
      'protocol.ts',
      'tablefork.worker.ts',
    ]);
  });
});
