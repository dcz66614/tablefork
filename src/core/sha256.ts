/**
 * P029 TableFork — 纯 TypeScript 同步 SHA-256 (P029-T009-FIX-01)
 *
 * 来源与选择理由（详见 artifacts/logs/T009-FIX-01.txt §2）：
 * - 算法：FIPS 180-4 SHA-256，64 轮压缩函数，标准 K 常量与初始 H 值，
 *   按规范手写，无第三方依赖。
 * - 为什么不用 WebCrypto：witness.ts 的见证搜索是同步的，WebCrypto
 *   crypto.subtle.digest 是异步的，无法直接替换；本实现同步返回，
 *   与原 node:crypto 的 sha256Utf8 签名 `(text: string) => string`
 *   完全一致。
 * - 为什么不用 node:crypto：公共浏览器内核（项目书 §6.2）要求无 Node
 *   专属调用；`import { createHash } from 'node:crypto'` 使 vite build
 *   失败（`"createHash" is not exported by "__vite-browser-external"`），
 *   UI 与 T010 的 Worker 都撞同一堵墙。
 * - UTF-8 编码：TextEncoder（浏览器 / Node / Vitest 三处均有，与 Node
 *   'utf8' 编码一致：孤立代理项按 U+FFFD 计）。
 * - 本文件不 import 任何 Node 模块，不依赖 WebCrypto；浏览器 + Node +
 *   Vitest 三处都能跑。输出 hex 小写。
 */

/** SHA-256 轮常量 K[0..63]（FIPS 180-4 §4.2.2，前 64 个素数立方根小数部分的前 32 位）。 */
const K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** SHA-256 初始哈希值 H0[0..7]（FIPS 180-4 §5.3.3，前 8 个素数平方根小数部分的前 32 位）。 */
const H0: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * SHA-256（hex 小写），对输入字符串的 UTF-8 字节算。
 * 与 Node `createHash('sha256').update(text, 'utf8').digest('hex')`
 * 及 WebCrypto `crypto.subtle.digest('SHA-256', …)` 逐字节一致
 * （同一算法同一输入必同值；已知向量与对照见 tests/core/t009fix01-temp.test.ts）。
 */
export function sha256Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bitLen = bytes.length * 8;

  // 填充：0x80，0x00 至长度 ≡ 56 (mod 64)，末尾 8 字节大端 bit 长度。
  const paddedLen = (((bytes.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLenHi = Math.floor(bitLen / 0x100000000);
  const bitLenLo = bitLen >>> 0;
  padded[paddedLen - 8] = (bitLenHi >>> 24) & 0xff;
  padded[paddedLen - 7] = (bitLenHi >>> 16) & 0xff;
  padded[paddedLen - 6] = (bitLenHi >>> 8) & 0xff;
  padded[paddedLen - 5] = bitLenHi & 0xff;
  padded[paddedLen - 4] = (bitLenLo >>> 24) & 0xff;
  padded[paddedLen - 3] = (bitLenLo >>> 16) & 0xff;
  padded[paddedLen - 2] = (bitLenLo >>> 8) & 0xff;
  padded[paddedLen - 1] = bitLenLo & 0xff;

  const h = [...H0];
  const w = new Array<number>(64);

  for (let block = 0; block < paddedLen; block += 64) {
    for (let t = 0; t < 16; t++) {
      const i = block + t * 4;
      w[t] =
        ((padded[i] << 24) |
          (padded[i + 1] << 16) |
          (padded[i + 2] << 8) |
          padded[i + 3]) >>>
        0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let t = 0; t < 64; t++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + K[t] + w[t]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  let out = '';
  for (let i = 0; i < 8; i++) {
    out += (h[i] >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}
