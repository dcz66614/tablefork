/**
 * P029 TableFork — 本地文本读取层出口 (P029-T007)
 *
 * 只 re-export src/io/localText.ts 的公共 API，不放实现。
 * （src/core/index.ts 仍由 T002 主控、T013 集成时挂接；本层出口独立，
 * 不改动它。）
 */

export type { LocalTextSource } from './localText';
export {
  assertWithinSizeLimit,
  isRemoteUrl,
  readTextFromBlob,
  readTextFromFile,
  readTextFromSource,
  textFromPaste,
} from './localText';
