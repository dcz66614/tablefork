/**
 * P029 TableFork — 本地文本读取层 (P029-T007)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §3.1（输入契约：粘贴或选择本地
 * .html/.md，最大 64 KiB UTF-8；§8 隐私：默认无后台上传、无远程请求）、
 * §4.2（输入可在浏览器展示、在 textarea 中编辑、一键清空；不写
 * localStorage/IndexedDB）；IMPLEMENTATION_PLAN.md §4.2（禁止未批准的
 * 出站网络）。
 *
 * 本层只从本地来源取文本，零网络：
 * - 支持：粘贴文本（string）、本地 File、本地 Blob（FileReader /
 *   Blob.text 这类本地 API，不经过网络栈）。
 * - 拒绝：任何远程 URL（http/https/协议相对 URL）——不 fetch、不 XHR、
 *   不读远程内容，直接抛错（见 readTextFromSource 与 J-T007-8）。
 * - 输入文本可编辑：本层只“取文本”，不锁定、不缓存、不持久化；
 *   编辑发生在 UI 文本区（T009），清空由 UI 状态清除（本层不留副本）。
 *
 * 大小：任一来源的 UTF-8 字节数超过 64 KiB（MAX_INPUT_BYTES，§3.1）
 * 直接报 OVER_SIZE，不读/不截断、不猜测。
 *
 * 本层是浏览器/Node 通用代码：只用 Blob/File/text() 与 TextEncoder，
 * 无 DOM 节点操作、无 Node 专属调用（fs / fetch 均未使用）。
 */

import { MAX_INPUT_BYTES } from '../core/index';
import { fail } from '../core/parse';

/**
 * 本地文本来源（判别联合类型）。
 * - paste：用户在 textarea 粘贴的文本（已是 string，直接取用）。
 * - file：用户选择的本地 .md / .html 文件（File.text()，本地读取）。
 * - blob：本地 Blob（如下拉/拖拽产生的本地对象；Blob.text()，本地读取）。
 * - url：远程 URL——本层不支持，readTextFromSource 直接抛错，绝不请求。
 */
export type LocalTextSource =
  | { kind: 'paste'; text: string }
  | { kind: 'file'; file: File }
  | { kind: 'blob'; blob: Blob }
  | { kind: 'url'; url: string };

const utf8Encoder = new TextEncoder();

/** 判定一个字符串是否像远程 URL（http/https，或协议相对 //host/...）。 */
export function isRemoteUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^(https?:)?\/\//i.test(trimmed);
}

/**
 * 校验文本的 UTF-8 字节数不超过 64 KiB 上限；超限报 OVER_SIZE。
 * 用 TextEncoder 实测字节数，不用 string.length（CJK 占 3 字节，见 T007）。
 */
export function assertWithinSizeLimit(text: string): void {
  const bytes = utf8Encoder.encode(text).length;
  if (bytes > MAX_INPUT_BYTES) {
    fail(
      'OVER_SIZE',
      `input text is ${bytes} UTF-8 bytes, exceeding the ${MAX_INPUT_BYTES} byte limit`,
    );
  }
}

/**
 * 从粘贴文本取文本：原样返回（不 trim、不 normalization），只做上限校验。
 * 粘贴内容本身即使形如 URL 也只是文本——把它当 M 内容比较，不当作来源；
 * 只有 LocalTextSource 的 url 种才表示“要去读一个远程地址”，才被拒绝。
 */
export function textFromPaste(pastedText: string): string {
  if (typeof pastedText !== 'string') {
    throw new TypeError('textFromPaste: pastedText 必须是字符串。');
  }
  assertWithinSizeLimit(pastedText);
  return pastedText;
}

/**
 * 从本地 Blob 读 UTF-8 文本（Blob.text()，本地 API，无网络）。
 * 先按 blob.size（字节数）做上限预检，再读后复核实测字节数。
 */
export async function readTextFromBlob(blob: Blob): Promise<string> {
  if (blob.size > MAX_INPUT_BYTES) {
    fail(
      'OVER_SIZE',
      `input blob is ${blob.size} bytes, exceeding the ${MAX_INPUT_BYTES} byte limit`,
    );
  }
  const text = await blob.text();
  assertWithinSizeLimit(text);
  return text;
}

/**
 * 从用户选择的本地文件读 UTF-8 文本（File.text()，本地 API，无网络）。
 * File 是 Blob 的子类，复用 readTextFromBlob；文件名仅用于诊断，不读路径。
 */
export async function readTextFromFile(file: File): Promise<string> {
  return readTextFromBlob(file);
}

/**
 * 按来源取文本的统一入口。
 * - paste / file / blob：本地读取（见上）。
 * - url：直接抛 Error（不是 TableForkError：7 个 ErrorCode 枚举只覆盖
 *   HTML 表结构错误，没有“远程来源”码，不冒用；见 J-T007-8）。
 *   抛错发生在任何读取之前，不产生任何网络请求。
 */
export async function readTextFromSource(source: LocalTextSource): Promise<string> {
  switch (source.kind) {
    case 'paste':
      return textFromPaste(source.text);
    case 'file':
      return readTextFromFile(source.file);
    case 'blob':
      return readTextFromBlob(source.blob);
    case 'url':
      throw new Error(
        `拒绝远程 URL 作为文本来源：${source.url}（TableFork 只读本地粘贴/文件，不发任何网络请求）。`,
      );
  }
}
