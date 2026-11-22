# TableFork — 第三方许可证清单

> 规格：PROJECT_BOOK.md v1.0.1 §8；生成方法：本文件由 `package.json` +
> `package-lock.json` 的包清单逐项核对 `node_modules/<包>/package.json` 的
> `license` 字段与包内 LICENSE 文件原文生成（核对脚本见
> `artifacts/logs/T013-release.txt` §6；许可证标识一律照抄原文，
> 未凭记忆编造）。锁文件 SHA-256：`80a86c951542fc09006c2f7e44f8686bf03f561935fbfe2e34b72e9e05d7974f`。
> 运行时进入浏览器产物的是 `react` / `react-dom`（及其传递依赖，如
> `scheduler`）；其余均为开发依赖（构建 / 测试 / 类型检查 / CLI），同样逐项列出。

## 直接依赖（package.json，11 个）

| 包 | 版本 | 许可证（package.json 原文） | 包内 LICENSE 文件 |
|---|---|---|---|
| `react` | 19.3.1 | MIT | LICENSE |
| `react-dom` | 19.3.1 | MIT | LICENSE |
| `@playwright/test` | 1.65.1 | Apache-2.0 | LICENSE |
| `@types/node` | 24.19.2 | MIT | LICENSE |
| `@types/react` | 19.3.0 | MIT | LICENSE |
| `@types/react-dom` | 19.3.0 | MIT | LICENSE |
| `@vitejs/plugin-react` | 5.2.0 | MIT | LICENSE |
| `tsx` | 4.23.15 | MIT | LICENSE |
| `typescript` | 5.9.3 | Apache-2.0 | LICENSE.txt |
| `vite` | 7.3.8 | MIT | LICENSE.md |
| `vitest` | 4.1.12 | MIT | LICENSE.md |

## 全部已安装包（package-lock.json，101 个，含传递依赖）

许可证分布：MIT 87、Apache-2.0 6、ISC 6、CC-BY-4.0 1、BSD-3-Clause 1。
全部为 MIT / Apache-2.0 / ISC / BSD-3-Clause / CC-BY-4.0 宽松许可证，
与本项目 MIT 分发兼容；其中 CC-BY-4.0 仅为 `caniuse-lite` 的数据文件，
不进入运行时产物。

| 包 | 版本 | 许可证（package.json 原文） | 包内 LICENSE 文件 |
|---|---|---|---|
| `@babel/code-frame` | 7.29.7 | MIT | LICENSE |
| `@babel/compat-data` | 7.29.7 | MIT | LICENSE |
| `@babel/core` | 7.29.13 | MIT | LICENSE |
| `@babel/generator` | 7.29.15 | MIT | LICENSE |
| `@babel/helper-compilation-targets` | 7.29.13 | MIT | LICENSE |
| `@babel/helper-globals` | 7.29.7 | MIT | LICENSE |
| `@babel/helper-module-imports` | 7.29.7 | MIT | LICENSE |
| `@babel/helper-module-transforms` | 7.29.14 | MIT | LICENSE |
| `@babel/helper-plugin-utils` | 7.29.7 | MIT | LICENSE |
| `@babel/helper-string-parser` | 7.29.15 | MIT | LICENSE |
| `@babel/helper-validator-identifier` | 7.29.7 | MIT | LICENSE |
| `@babel/helper-validator-option` | 7.29.7 | MIT | LICENSE |
| `@babel/helpers` | 7.29.15 | MIT | LICENSE |
| `@babel/parser` | 7.29.15 | MIT | LICENSE |
| `@babel/plugin-transform-react-jsx-self` | 7.29.7 | MIT | LICENSE |
| `@babel/plugin-transform-react-jsx-source` | 7.29.7 | MIT | LICENSE |
| `@babel/template` | 7.29.7 | MIT | LICENSE |
| `@babel/traverse` | 7.29.15 | MIT | LICENSE |
| `@babel/types` | 7.29.15 | MIT | LICENSE |
| `@esbuild/linux-x64` | 0.28.2 | MIT | — |
| `@jridgewell/gen-mapping` | 0.3.13 | MIT | LICENSE |
| `@jridgewell/remapping` | 2.3.5 | MIT | LICENSE |
| `@jridgewell/resolve-uri` | 3.1.3 | MIT | LICENSE |
| `@jridgewell/sourcemap-codec` | 1.6.0 | MIT | LICENSE |
| `@jridgewell/trace-mapping` | 0.3.31 | MIT | LICENSE |
| `@playwright/test` | 1.65.1 | Apache-2.0 | LICENSE |
| `@rolldown/pluginutils` | 1.0.0-rc.3 | MIT | LICENSE |
| `@rollup/rollup-linux-x64-gnu` | 4.68.7 | MIT | — |
| `@rollup/rollup-linux-x64-musl` | 4.68.7 | MIT | — |
| `@standard-schema/spec` | 1.1.0 | MIT | LICENSE |
| `@types/babel__core` | 7.20.5 | MIT | LICENSE |
| `@types/babel__generator` | 7.27.0 | MIT | LICENSE |
| `@types/babel__template` | 7.4.4 | MIT | LICENSE |
| `@types/babel__traverse` | 7.28.0 | MIT | LICENSE |
| `@types/chai` | 5.2.3 | MIT | LICENSE |
| `@types/deep-eql` | 4.0.2 | MIT | LICENSE |
| `@types/estree` | 1.0.10 | MIT | LICENSE |
| `@types/node` | 24.19.2 | MIT | LICENSE |
| `@types/react` | 19.3.0 | MIT | LICENSE |
| `@types/react-dom` | 19.3.0 | MIT | LICENSE |
| `@vitejs/plugin-react` | 5.2.0 | MIT | LICENSE |
| `@vitest/expect` | 4.1.12 | MIT | LICENSE |
| `@vitest/mocker` | 4.1.12 | MIT | LICENSE |
| `@vitest/pretty-format` | 4.1.12 | MIT | LICENSE |
| `@vitest/runner` | 4.1.12 | MIT | LICENSE |
| `@vitest/snapshot` | 4.1.12 | MIT | LICENSE |
| `@vitest/spy` | 4.1.12 | MIT | LICENSE |
| `@vitest/utils` | 4.1.12 | MIT | LICENSE |
| `assertion-error` | 2.0.1 | MIT | LICENSE |
| `baseline-browser-mapping` | 2.11.39 | Apache-2.0 | LICENSE.txt |
| `browserslist` | 4.29.6 | MIT | LICENSE |
| `caniuse-lite` | 1.0.30001826 | CC-BY-4.0 | LICENSE |
| `chai` | 6.3.0 | MIT | LICENSE |
| `convert-source-map` | 2.0.0 | MIT | LICENSE |
| `csstype` | 3.2.4 | MIT | LICENSE |
| `debug` | 4.4.3 | MIT | LICENSE |
| `electron-to-chromium` | 1.5.492 | ISC | LICENSE |
| `es-module-lexer` | 2.3.2 | MIT | LICENSE |
| `esbuild` | 0.28.2 | MIT | LICENSE.md |
| `escalade` | 3.2.0 | MIT | — |
| `estree-walker` | 3.0.3 | MIT | LICENSE |
| `expect-type` | 1.4.0 | Apache-2.0 | LICENSE |
| `fdir` | 6.5.0 | MIT | LICENSE |
| `gensync` | 1.0.0-beta.2 | MIT | LICENSE |
| `js-tokens` | 4.0.0 | MIT | LICENSE |
| `jsesc` | 3.1.0 | MIT | — |
| `json5` | 2.2.3 | MIT | LICENSE.md |
| `lru-cache` | 5.1.1 | ISC | LICENSE |
| `magic-string` | 0.30.21 | MIT | LICENSE |
| `ms` | 2.1.3 | MIT | — |
| `nanoid` | 3.3.20 | MIT | LICENSE |
| `node-releases` | 2.0.65 | MIT | LICENSE |
| `obug` | 2.2.1 | MIT | LICENSE |
| `pathe` | 2.0.3 | MIT | LICENSE |
| `picocolors` | 1.1.1 | ISC | LICENSE |
| `picomatch` | 4.0.7 | MIT | LICENSE |
| `playwright` | 1.65.1 | Apache-2.0 | LICENSE |
| `playwright-core` | 1.65.1 | Apache-2.0 | LICENSE |
| `postcss` | 8.5.33 | MIT | LICENSE |
| `react` | 19.3.1 | MIT | LICENSE |
| `react-dom` | 19.3.1 | MIT | LICENSE |
| `react-refresh` | 0.18.0 | MIT | LICENSE |
| `rollup` | 4.68.7 | MIT | LICENSE.md |
| `scheduler` | 0.28.0 | MIT | LICENSE |
| `semver` | 6.3.2 | ISC | LICENSE |
| `siginfo` | 2.0.0 | ISC | LICENSE |
| `source-map-js` | 1.2.4 | BSD-3-Clause | LICENSE |
| `stackback` | 0.0.2 | MIT | — |
| `std-env` | 4.3.0 | MIT | LICENCE |
| `tinybench` | 2.9.0 | MIT | LICENSE |
| `tinyexec` | 1.3.1 | MIT | LICENSE |
| `tinyglobby` | 0.2.17 | MIT | LICENSE |
| `tinyrainbow` | 3.2.0 | MIT | LICENCE |
| `tsx` | 4.23.15 | MIT | LICENSE |
| `typescript` | 5.9.3 | Apache-2.0 | LICENSE.txt |
| `undici-types` | 7.24.6 | MIT | LICENSE |
| `update-browserslist-db` | 1.4.0 | MIT | LICENSE |
| `vite` | 7.3.8 | MIT | LICENSE.md |
| `vitest` | 4.1.12 | MIT | LICENSE.md |
| `why-is-node-running` | 2.3.0 | MIT | LICENSE |
| `yallist` | 3.1.1 | ISC | LICENSE |

## 未安装的可选平台原生包（package-lock.json，50 个）

以下包只在对应平台由 npm 按需安装；在本次 linux-x64 的 `npm ci` 中
未安装、未进入构建产物，其许可证未在本机核对。如需在对应平台使用，
须在该平台 `npm ci` 后重新核对 `node_modules/<包>/package.json`。
（同族已安装包的许可证均为 MIT：`@esbuild/linux-x64`、`esbuild`、
`@rollup/rollup-linux-x64-gnu`、`rollup` 在上表均为 MIT，但本清单不以
此推断未安装包的许可证。）

- `@esbuild/aix-ppc64@0.28.2`
- `@esbuild/android-arm@0.28.2`
- `@esbuild/android-arm64@0.28.2`
- `@esbuild/android-x64@0.28.2`
- `@esbuild/darwin-arm64@0.28.2`
- `@esbuild/darwin-x64@0.28.2`
- `@esbuild/freebsd-arm64@0.28.2`
- `@esbuild/freebsd-x64@0.28.2`
- `@esbuild/linux-arm@0.28.2`
- `@esbuild/linux-arm64@0.28.2`
- `@esbuild/linux-ia32@0.28.2`
- `@esbuild/linux-loong64@0.28.2`
- `@esbuild/linux-mips64el@0.28.2`
- `@esbuild/linux-ppc64@0.28.2`
- `@esbuild/linux-riscv64@0.28.2`
- `@esbuild/linux-s390x@0.28.2`
- `@esbuild/netbsd-arm64@0.28.2`
- `@esbuild/netbsd-x64@0.28.2`
- `@esbuild/openbsd-arm64@0.28.2`
- `@esbuild/openbsd-x64@0.28.2`
- `@esbuild/openharmony-arm64@0.28.2`
- `@esbuild/sunos-x64@0.28.2`
- `@esbuild/win32-arm64@0.28.2`
- `@esbuild/win32-ia32@0.28.2`
- `@esbuild/win32-x64@0.28.2`
- `@rollup/rollup-android-arm-eabi@4.68.7`
- `@rollup/rollup-android-arm64@4.68.7`
- `@rollup/rollup-android-x64@4.68.7`
- `@rollup/rollup-darwin-arm64@4.68.7`
- `@rollup/rollup-darwin-x64@4.68.7`
- `@rollup/rollup-freebsd-arm64@4.68.7`
- `@rollup/rollup-freebsd-x64@4.68.7`
- `@rollup/rollup-linux-arm-gnueabihf@4.68.7`
- `@rollup/rollup-linux-arm-musleabihf@4.68.7`
- `@rollup/rollup-linux-arm64-gnu@4.68.7`
- `@rollup/rollup-linux-arm64-musl@4.68.7`
- `@rollup/rollup-linux-loong64-gnu@4.68.7`
- `@rollup/rollup-linux-loong64-musl@4.68.7`
- `@rollup/rollup-linux-ppc64-gnu@4.68.7`
- `@rollup/rollup-linux-ppc64-musl@4.68.7`
- `@rollup/rollup-linux-riscv64-gnu@4.68.7`
- `@rollup/rollup-linux-riscv64-musl@4.68.7`
- `@rollup/rollup-linux-s390x-gnu@4.68.7`
- `@rollup/rollup-openbsd-x64@4.68.7`
- `@rollup/rollup-openharmony-arm64@4.68.7`
- `@rollup/rollup-win32-arm64-msvc@4.68.7`
- `@rollup/rollup-win32-ia32-msvc@4.68.7`
- `@rollup/rollup-win32-x64-gnu@4.68.7`
- `@rollup/rollup-win32-x64-msvc@4.68.7`
- `fsevents@2.3.3`

## 自有代码

本项目自有代码（`src/`、`cli/`、`oracle/reference.py`、`tests/`、
`scripts/verify_release.mjs`）为 MIT，见根目录 `LICENSE`。