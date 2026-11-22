/**
 * P029-T011 formal test — taken over from the P029-T009-FIX-01 temporary test.
 *
 * 本文件是 P029-T009-FIX-01 的正式测试（P029-T011 接管，全部断言保留）：覆盖纯 TypeScript 同步
 * SHA-256（src/core/sha256.ts）与改后 analyze() 的 §6.3 哈希钉死。
 *  * 所有已知向量期望值均为公开标准值（FIPS 180-4 / NIST 已知答案），
 * 未从被测实现复制；§6.3 哈希期望取自 T005/T008 已独立钉死的值。
 * Node 对照（createHash）只在测试内作交叉核对——生产代码
 * src/core/* 已不再 import node:crypto。
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Utf8 } from '../../src/core/sha256';
import { sha256Utf8 as witnessSha256 } from '../../src/core/witness';
import { analyze, sha256Utf8WebCrypto } from '../../src/core/report';
import { TFK_A_HTML } from '../../src/ui/presets';

const nodeSha256 = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

describe('T009-FIX-01 pure-TS SHA-256 known vectors', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    [
      'a'.repeat(1_000_000),
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    ],
  ])('sha256(%s) == %s', (input, expected) => {
    expect(sha256Utf8(input)).toBe(expected);
    expect(sha256Utf8(input)).toBe(nodeSha256(input));
  });

  it('matches Node createHash across padding boundaries and unicode', () => {
    const inputs = [
      'x'.repeat(55), // 55 bytes: 1-block padding boundary
      'x'.repeat(56), // 56 bytes: spills to a second block
      'x'.repeat(63),
      'x'.repeat(64),
      'x'.repeat(119),
      'x'.repeat(120),
      'x'.repeat(128),
      'hello tablefork',
      '产品2026预算成本甲乙丙',
      '😀'.repeat(20), // astral plane, 4-byte UTF-8
      '\uD800', // lone high surrogate -> U+FFFD, same as TextEncoder / Node utf8
      '\uD800\uDC00', // valid surrogate pair -> U+10000
      'a'.repeat(1000),
    ];
    for (const input of inputs) {
      expect(sha256Utf8(input)).toBe(nodeSha256(input));
    }
  });

  it('witness.sha256Utf8 re-export is the same pure-TS function', () => {
    expect(witnessSha256('abc')).toBe(sha256Utf8('abc'));
    expect(witnessSha256('abc')).toBe(nodeSha256('abc'));
  });

  it('report sha256Utf8WebCrypto thin wrapper still agrees', async () => {
    await expect(sha256Utf8WebCrypto('abc')).resolves.toBe(nodeSha256('abc'));
    await expect(sha256Utf8WebCrypto('')).resolves.toBe(nodeSha256(''));
  });

  it('§6.3 example hashes unchanged after the fix', async () => {
    const origin = await analyze({
      schema: 'tablefork.input/v1',
      html: TFK_A_HTML,
      strategy: 'ORIGIN_EMPTY',
    }, 'job-test-1');
    expect(origin.proof?.aGraphSha256).toBe(
      'dbd4b9cebec9a13f40cfdff378c78d1f59325cdc0e721faa0b4068eb90de157d',
    );
    expect(origin.proof?.bGraphSha256).toBe(
      'a9ec182caf420715248a255286d2daef973a8e22719691db813dd05d88238bc5',
    );
    expect(origin.proof?.markdownSha256).toBe(
      '83da510440918640ba87eff47fa11cad70444955f6ce7e36724e4d26765338c1',
    );
    const repeat = await analyze({
      schema: 'tablefork.input/v1',
      html: TFK_A_HTML,
      strategy: 'REPEAT_VALUE',
    }, 'job-test-1');
    expect(repeat.proof?.aGraphSha256).toBe(
      'dbd4b9cebec9a13f40cfdff378c78d1f59325cdc0e721faa0b4068eb90de157d',
    );
    expect(repeat.proof?.bGraphSha256).toBe(
      'ba552bb47172087248e45ce9ad5d71a8c5a4435719c1faac360be665c17e1bd1',
    );
    expect(repeat.proof?.markdownSha256).toBe(
      'e97edc1bda41731291466e2a64d0338df9abcf7b30f947ce1768592eba0bdffb',
    );
  });
});
