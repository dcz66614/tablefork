/**
 * P029 TableFork — 公共浏览器内核与结果 JSON (P029-T008)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §6.1（AnalyzeInput /
 * AnalyzeResult / CollisionProof 权威字段）、§6.2（公共浏览器内核
 * analyze(input, jobId): Promise<AnalyzeResult>，无 Node 专属调用）、§5.3
 * （Markdown 对账不是碰撞证明）、§5.2（碰撞证书）；IMPLEMENTATION_PLAN.md
 * §4.1（流程）、§4.2（JSON 与失败合同）、§6 的 P029-T008 卡。
 *
 * 流程（计划 §4.1）：解析 → 网格 → 标题（records.ts 内含）→ F（按
 * input.strategy 生成 canonicalMarkdown）→ 比较（input.suppliedMarkdown
 * 提供时调 compareMarkdown，未提供时 NOT_SUPPLIED）→ 见证（调
 * findWitness，其 proof 原样放入 proof）→ facts（调 records.ts）→
 * warnings。
 *
 * 失败语义（计划 §4.2）：无效输入抛 TableForkError（枚举错误码），
 * 绝不返回误导性的分析结果。parse/grid/findWitness 抛出的
 * TableForkInputError 原样传播（code 不变）；analyze 入口自身的
 * schema/strategy/类型校验同样抛 TableForkInputError（见 J-T008-2）。
 * 因此 AnalyzeResult.witness 的 'UNSUPPORTED' 在本层永不产出——
 * 不支持的输入在到达结果组装前已抛错（见 J-T008-1）。
 *
 * 浏览器安全：本文件不 import 'node:crypto'（§6.2 公共浏览器内核
 * 无 Node 专属调用）。witness.ts 的哈希在 P029-T009-FIX-01 中已换成
 * 纯 TypeScript 同步实现（src/core/sha256.ts，FIPS 180-4），本文件
 * 的复核直接调用同一共享函数；WebCrypto 助手 sha256Utf8WebCrypto
 * 保留为薄包装（仍导出，t008 测试 import 它），不再是复核路径。
 * T008 报告层原注明的“T013 挂载时须换哈希”已由本修复卡提前完成。
 *
 * 结果全部 JSON 可序列化：只含 string / number / boolean / 数组 /
 * 普通对象，无函数、无 undefined、无 Map。proof 不存在时字段整个
 * 省略（不写 `proof: undefined`），见 J-T008-3。
 */

import {
  INPUT_SCHEMA,
  REPORT_SCHEMA,
  SPEC_VERSION,
  isTableForkError,
  type AnalyzeInput,
  type AnalyzeResult,
  type Strategy,
} from './index';
import { compareMarkdown } from './compare';
import { flattenGrid } from './flatten';
import { buildGrid } from './grid';
import { parseValidatedTable, TableForkInputError } from './parse';
import { buildSlotFacts } from './records';
import { canonicalCellGraph, findWitness, sha256Utf8 } from './witness';
import { sha256Utf8 as sha256Sync } from './sha256';

/**
 * 浏览器安全的 SHA-256（hex 小写），对输入字符串的 UTF-8 字节算。
 *
 * P029-T009-FIX-01：本函数保留为薄包装——直接委托给共享同步实现
 * （src/core/sha256.ts，FIPS 180-4），不再走 WebCrypto。保留原因：
 * 它是已导出的公共助手，t008 临时测试 import 它；删除会断测试。
 * analyze() 内部的复核改用同步共享函数（见 analyze 内 J-T008-5 新注），
 * 与 witness 的 proof 用同一实现算出，不再需要异步的 WebCrypto 路径。
 * 同步签名不变；analyze() 保持 async 签名（公共 API）。
 */
export async function sha256Utf8WebCrypto(text: string): Promise<string> {
  return sha256Sync(text);
}

/** analyze 入口校验失败时抛 TableForkInputError（J-T008-2 的兜底桶口径）。 */
function failInput(message: string): never {
  throw new TableForkInputError('INVALID_RAGGED_GRID', `analyze: ${message}`);
}

/**
 * 公共浏览器内核（§6.2）：对一份输入出完整 tablefork.report/v1。
 *
 * P029-FIX-02（R1 P1-02，项目书 §9 优先）：签名改为 analyze(input, jobId)，
 * jobId 为必填第二参数，不得给空串默认值（fail-closed：非空字符串校验
 * 不通过时与无效输入同码抛错，不返回无 jobId 的结果）。结果携带三字段：
 * jobId（传入值原样）、inputHash（输入 HTML 原文的 SHA-256 十六进制，
 * 与 witness 的 proof 用同一同步实现 src/core/sha256.ts 算出）、
 * specVersion（SPEC_VERSION 常量，当前 '1.0.2'）。
 *
 * @param input schema 必须为 'tablefork.input/v1'，html 为字符串，
 *   strategy 为 'ORIGIN_EMPTY' | 'REPEAT_VALUE'，suppliedMarkdown
 *   如提供必须为字符串。
 * @param jobId 调用方传入的任务标识，非空字符串（Worker 传消息外层
 *   jobId；CLI 传 `cli-<fixture_id>`；测试传确定性 id）。
 * @returns 完整 AnalyzeResult；proof 仅在见证成立时存在（否则字段省略）。
 * @throws TableForkInputError 输入无效/不支持时抛枚举错误，不返回结果。
 * @throws Error 内部哈希复核不一致时抛普通 Error（实现不一致，不是输入问题）。
 */
export async function analyze(input: AnalyzeInput, jobId: string): Promise<AnalyzeResult> {
  if (typeof jobId !== 'string' || jobId === '') {
    failInput('jobId must be a non-empty string');
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    failInput('input must be an object with schema "tablefork.input/v1"');
  }
  if (input.schema !== INPUT_SCHEMA) {
    failInput(`schema must be "${INPUT_SCHEMA}", got ${JSON.stringify(input.schema)}`);
  }
  if (typeof input.html !== 'string') {
    failInput('html must be a string');
  }
  if (input.strategy !== 'ORIGIN_EMPTY' && input.strategy !== 'REPEAT_VALUE') {
    failInput(
      `strategy must be "ORIGIN_EMPTY" or "REPEAT_VALUE", got ${JSON.stringify(input.strategy)}`,
    );
  }
  if (input.suppliedMarkdown !== undefined && typeof input.suppliedMarkdown !== 'string') {
    failInput('suppliedMarkdown must be a string when provided');
  }
  const strategy: Strategy = input.strategy;

  // 解析 → 网格（非法/不支持在此抛 TableForkInputError，原样传播）。
  const parsed = parseValidatedTable(input.html);
  const grid = buildGrid(parsed);

  // F（按策略生成 canonicalMarkdown）。
  const canonicalMarkdown = flattenGrid(grid, strategy);

  // 比较：未提供 M 时 compareMarkdown 返回 NOT_SUPPLIED；
  // M 超 64 KiB 时它抛 OVER_SIZE（TableForkInputError），原样传播。
  const compare = compareMarkdown(input.suppliedMarkdown, canonicalMarkdown);

  // 见证：proof 原样放入结果；合法输入无候选时为 NO_WITNESS_FOUND。
  // findWitness 对非法输入会抛错，但上游 parse 已先行校验，到此不会再抛。
  const witnessResult = findWitness(input.html, strategy);

  // facts：逐槽记录（records.ts）。
  const facts = buildSlotFacts(grid);

  // 哈希复核（J-T008-5，P029-T009-FIX-01 改为共享同步实现）：
  // 用与 witness 同一的同步 SHA-256（src/core/sha256.ts）重算
  // canonicalMarkdown 与 A 图的哈希，与 witness 的 proof 逐字节核对。
  // 原 WebCrypto 异步复核已撤下：同一实现算两遍仍能捕获“proof 与
  // canonicalMarkdown / A 图不一致”的装配错误，且 analyze 不再依赖
  // crypto.subtle 在调用环境中存在；与 node:crypto / WebCrypto 的
  // 等价性由 tests/core/t009fix01-temp.test.ts 的已知向量钉死。
  // 无 proof 时（NO_WITNESS_FOUND）仍跳过复核（见原注）。
  if (witnessResult.proof !== undefined) {
    const markdownHash = sha256Sync(canonicalMarkdown);
    const aGraphHash = sha256Sync(canonicalCellGraph(grid));
    if (markdownHash !== witnessResult.proof.markdownSha256) {
      throw new Error(
        `analyze: internal hash mismatch: markdown SHA-256 ${markdownHash} ` +
          `!= witness markdownSha256 ${witnessResult.proof.markdownSha256}`,
      );
    }
    if (aGraphHash !== witnessResult.proof.aGraphSha256) {
      throw new Error(
        `analyze: internal hash mismatch: A-graph SHA-256 ${aGraphHash} ` +
          `!= witness aGraphSha256 ${witnessResult.proof.aGraphSha256}`,
      );
    }
  }

  // warnings：固定顺序、确定性文案；无触发条件时为空数组。
  const warnings: string[] = [];
  if (compare.status === 'EXACT_DIFF') {
    warnings.push(
      'M 与 F(A) 不一致（EXACT_DIFF）：碰撞证书只对 F(A) 生效，不适用于 M。',
    );
  }
  if (witnessResult.status === 'NO_WITNESS_FOUND') {
    warnings.push(
      '未找到单格拆分见证（NO_WITNESS_FOUND）：只表示在限定构造器里没找到，不表示表格保真。',
    );
  }
  const unknownCount = facts.filter((fact) => fact.headerStatus === 'UNKNOWN').length;
  if (unknownCount > 0) {
    warnings.push(
      `${unknownCount} 个数据槽的标题未知（headerStatus=UNKNOWN），交接稿中写 ?，不得据此宣称业务归属。`,
    );
  }

  // 组装：proof 不存在时字段整个省略（J-T008-3），不写 proof: undefined。
  // FIX-02：三字段齐全——jobId 由传入参数填入；inputHash 为输入 HTML
  // 原文的 SHA-256（与 witness 的 proof 同一同步实现）；specVersion
  // 为 SPEC_VERSION 常量。最终序列化的 JSON（UI 下载、CLI 输出、
  // Worker RESULT 的 data）由此三字段齐全（项目书 §9）。
  const result: AnalyzeResult = {
    schema: REPORT_SCHEMA,
    jobId,
    inputHash: sha256Sync(input.html),
    specVersion: SPEC_VERSION,
    compare: compare.status,
    witness: witnessResult.status,
    canonicalMarkdown,
    facts,
    warnings,
  };
  if (witnessResult.proof !== undefined) {
    result.proof = witnessResult.proof;
  }
  return result;
}

/** 供调用方复用的重导出：判定未知值是否为 TableForkError 形状。 */
export { isTableForkError, sha256Utf8 };
