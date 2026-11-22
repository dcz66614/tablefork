# TableFork — 终审源码索引（REVIEW_INDEX）

> 规格 v1.0.2；基线提交 `6c81860`；本索引生成时 HEAD `d6101aaa4e08fc0d856d76904e650899c0fea347`。
> 覆盖：清单（`review/RELEASE_MANIFEST.json`）所列全部源码路径；
> 代码文本文件全文展开于各 REVIEW_PACK 分卷（块 SHA-256 与清单一致，
> `npm run verify:release` 逐块核对）；非代码文件（fixture 数据、文档、
> 日志、截图）列入下表并以清单 SHA-256 为准，不展开全文。
> 终审入口：先读本索引，再按需读各分卷；截图映射见 `review/SCREENSHOT_INDEX.md`。

## 分卷表

| 分卷 | 文件数 | 字节数 | SHA-256 |
|---|---|---|---|
| REVIEW_PACK_01.md | 11 | 107849 | 9129100f1a3c7db409ef61811731ad0d17c0b0c714340243db8f1e1d801110ba |
| REVIEW_PACK_02.md | 15 | 86816 | b7343c54fedb0ffa13c123cd1e3ccff7a44410fb94409997f7e8b9e627d7ab78 |
| REVIEW_PACK_03.md | 10 | 117646 | aa87e06d2798625d4df58bd7edceff9c511de328aee7fc7e1ad5c0f49cb49005 |
| REVIEW_PACK_04.md | 7 | 60665 | d5502dde61bbf5a245c21d39b731f5e957f01fe8ecbeed17c23658b74e610859 |
| REVIEW_PACK_05.md | 7 | 85291 | 684a78fdf08ec5e103325f853c41bddd4e7b1b2bb993cc6dfaba3afe7c2357ad |

**合计：5 卷，50 个代码文本文件，192 个清单文件。**

## 代码文本文件（全文在分卷中）

| 路径 | 分卷 | SHA-256 | 行数 |
|---|---|---|---|
| cli/analyze.ts | REVIEW_PACK_02.md | 720626eaf2afc170f00f94760db218d6db28d5124b3c8c81800738c551be6327 | 214 |
| index.html | REVIEW_PACK_05.md | 4f212f779132493cd11329b2514fedc359922f072e4ac0f8154403fc7ba627da | 12 |
| oracle/reference.py | REVIEW_PACK_05.md | bd135b32ecb3155a02cb5e441e8d6cc8a51d81fcfc55c2f55931a628c76f1992 | 1125 |
| package.json | REVIEW_PACK_05.md | 1c5a018189bd2d8159884d1bbd7643a1e7c694cd98eff28db6dc50a266660740 | 1 |
| playwright.config.ts | REVIEW_PACK_05.md | 637a0f2ddfac72ee775c0798950c5477bffe09c54f3146c9d06fb7c65ac4c1bb | 48 |
| scripts/verify_release.mjs | REVIEW_PACK_05.md | 89948e80d1fd36f69b507c605011240b713c33d14cef2808edc979f13036f316 | 689 |
| src/core/compare.ts | REVIEW_PACK_01.md | dd4ec5ac7b3675edf2fde5ebfe3c4b7da0a3bfe293f03b910347f996b01dba80 | 467 |
| src/core/flatten.ts | REVIEW_PACK_01.md | 19f185f523a28337f483b6658387b52b8d0fe2516fe3ef4865be63885d58da27 | 91 |
| src/core/grid.ts | REVIEW_PACK_01.md | 7431eacaa7a88990954dadaf655de424b02c8bcda41bee10b57c16832d5eb618 | 180 |
| src/core/headers.ts | REVIEW_PACK_01.md | 33a80b2f0412ba261e465ca82a6c70f58b28d15083e8fc4ad6d8d7f16ca155d0 | 111 |
| src/core/index.ts | REVIEW_PACK_01.md | a04cbab6a3ca5982557e87a8d56418e379a9d3484facaefa66a2655855e03b6e | 118 |
| src/core/parse.ts | REVIEW_PACK_01.md | f302eec9dcd5a5a2a14ccabfd15016e85a03463c0e75410986e869bc82bafc25 | 775 |
| src/core/records.ts | REVIEW_PACK_01.md | 310fbd75fd76d5cdbec2e1649eed63274888c8e1074564b0eac12dd0ec27d158 | 93 |
| src/core/report.ts | REVIEW_PACK_01.md | 2f81faa0f01aaa1c8945d0d0aabc24ef9d4d9aa0f97aab587efdcea0dbfb5469 | 198 |
| src/core/sha256.ts | REVIEW_PACK_01.md | 697acf3a98415995479b6b50f2b30b016d3666f6b9c45448fb64bd3eeb70e9d9 | 132 |
| src/core/types.ts | REVIEW_PACK_01.md | 4eba6f80b85a6d5e84627cb1cf361c090c5e3dc94f489391c0a1f219cbc5285c | 148 |
| src/core/witness.ts | REVIEW_PACK_01.md | 57bc4e9a2e183caf7b06650ddc5d8030cc30117907815ac5163d2fd7a1a0a6e9 | 401 |
| src/io/index.ts | REVIEW_PACK_02.md | 31b588b0386e3eb7fa47fa460070c748cd042d2291af13ae3348d39334662590 | 17 |
| src/io/localText.ts | REVIEW_PACK_02.md | e1cdffd322ce7cab381688722488a927e12d4733b50e5a0426106db6dd63a128 | 120 |
| src/main.tsx | REVIEW_PACK_02.md | b565d2c9d567c318d8f208fcb2ee9b8cce6bdac0657773ab40a7bf155aff86fc | 13 |
| src/ui/App.tsx | REVIEW_PACK_02.md | b0ea1462602cdbff9f981df29d4ee5281ee554f236e79a338a4b328a93d77ddb | 453 |
| src/ui/DualTableView.tsx | REVIEW_PACK_02.md | 63da296d1cf3eeb761aecbf8d6d90f96933ee1f7f456e60d8ca93ecef37cd16b | 214 |
| src/ui/ExportPanel.tsx | REVIEW_PACK_02.md | 563537afbe9a13a0cf4e99ec55e1d32e03bb6cb902c0154bde2a526374f8a323 | 146 |
| src/ui/InputPanel.tsx | REVIEW_PACK_02.md | 402e07e0f8ef65506687e20c9a4330b20e5740bf1b7d419458f008137eb9d248 | 236 |
| src/ui/MarkdownPanel.tsx | REVIEW_PACK_02.md | 4e1c8ec93df657919ea92c163dbbe4c9fae64d724e4ad6b61627dbb22b657811 | 47 |
| src/ui/ProofPanel.tsx | REVIEW_PACK_02.md | b64f80fba9b1ee9f5c6e5d00817a064aa30b2047051f760f6f5b52ced7c73995 | 170 |
| src/ui/presets.ts | REVIEW_PACK_02.md | c2e6b183566b5fba8f5cd1a0c668d1f51e2fd9bb1d41d9ce64a824cfca9ccb88 | 90 |
| src/ui/styles.css | REVIEW_PACK_02.md | 8e6a12b8b6ca73e2f21d919ec389e723f3ac3fd7dabcb33452b9845730e4f98e | 246 |
| src/vite-env.d.ts | REVIEW_PACK_02.md | 65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5 | 1 |
| src/worker/protocol.ts | REVIEW_PACK_02.md | 39ce3a2b03938b690a624d703f8d6e68c64018918464571f8f2227444a32e66b | 100 |
| src/worker/tablefork.worker.ts | REVIEW_PACK_02.md | b2a87bac70f2621d3da91cb604ccc8ee76418aecfb85ab0dab6232323ee5a6d0 | 202 |
| tests/core/compare.test.ts | REVIEW_PACK_03.md | 20b483decbbe48dead553f75edd19f74cf1231527340fb425503c9b5269b9d8e | 345 |
| tests/core/flatten.test.ts | REVIEW_PACK_03.md | 9ba6c049ed7986aedc1e67e95870475ce8f276b4f6768465a185d464a97b1c09 | 248 |
| tests/core/golden.test.ts | REVIEW_PACK_03.md | c336bd551bd750ad55dd8b85a0a5e78f24b1cd361cc35666d6019e30e1ff1785 | 272 |
| tests/core/grid.test.ts | REVIEW_PACK_03.md | 0bd9bdb73a73ff5f63a5d718e12be66202c9531709dfb036156984725454e51b | 518 |
| tests/core/nbsp.test.ts | REVIEW_PACK_03.md | 8b6276177c714fecd213fbf5468961e5f6877a935b032c53e3ec11b5b8238116 | 130 |
| tests/core/report-facts.test.ts | REVIEW_PACK_03.md | 22387317babd0f86139c4199e84fcb503286553b9cae4d688d1542f321317cbd | 54 |
| tests/core/report.test.ts | REVIEW_PACK_03.md | dc5c00f5bf947716815fccab0e1dce454e1fbf3095e535d93c10e4bd00f069d9 | 513 |
| tests/core/sha256.test.ts | REVIEW_PACK_03.md | 79097708c7824ac66f787b0188f679555ce30a6f87f36f9cf4e79bae5fa432ae | 99 |
| tests/core/witness.test.ts | REVIEW_PACK_03.md | bf1832540562996315fa862b0c381b2660ab1813069bbaddf576eb3ffba72f45 | 310 |
| tests/core/worker.test.ts | REVIEW_PACK_03.md | 991c89a79fa583dd5f2f9f01fedb05aa302e0364c3a4a1325fe4dbdc1c3304b2 | 333 |
| tests/e2e/perf-table.ts | REVIEW_PACK_04.md | 59d806deedb4ae3d71b82b0c1ba0976efff009e65a3d4fbc4ed08f4bc6bf0405 | 50 |
| tests/e2e/performance.e2e.ts | REVIEW_PACK_04.md | d2acb9aa7909369ea7941a779d00288c7ad9010bd0a46fab1e9fb6de18d15459 | 70 |
| tests/e2e/tablefork.e2e.ts | REVIEW_PACK_04.md | 6a744700b3ff3945bfd2fdd364bd3df7e84e4b97ef8f36bc276b5c9a7b8926e2 | 498 |
| tests/property/compare.ts | REVIEW_PACK_04.md | 960a461255318feef14297d57bc1d23ccfbcdd28fc440aaf66d427313858c6ed | 307 |
| tests/property/crosscheck.test.ts | REVIEW_PACK_04.md | 93b65230a3cd62e5df69c235ddf3281a5e67092dc7a717fddba683f3d704090a | 200 |
| tests/property/generator.ts | REVIEW_PACK_04.md | 09f69e43a7a6ad656e03b0a52a4c1824fcd45a8a109ce92e882caf1306209352 | 207 |
| tests/property/oracle_driver.py | REVIEW_PACK_04.md | ff75c521ac168f14b6dd12394b6933910bd866034e3c3e95219c8bcb1896e856 | 62 |
| tsconfig.json | REVIEW_PACK_05.md | 7d7066e7450ecd752e62f5ee0faefc3ac7a477fa8a7242aa5f0974e3c1049ab3 | 1 |
| vite.config.ts | REVIEW_PACK_05.md | 2f82a0c9cac555c7a376b3babe9203b4c74a88194be36c5e0847cca0a9cfd3c2 | 7 |

## 非代码清单文件（清单 SHA-256 为准，不展开全文）

| 路径 | SHA-256 | 字节数 | 说明 |
|---|---|---|---|
| .gitignore | 09c82b047cf2667c8af44b3e74592f56cffe36809f64b01d46a11ee3b056b663 | 112 | 忽略规则（含 artifacts/release/*.zip 例外） |
| artifacts/logs/drive-archive-f53cef4.json | f9fe54eb3e598a69ef7c0c586d737d19021e27741ebbd3b482e3686a2578141d | 8292 | 任务验收日志 |
| artifacts/logs/FIX-01.txt | 24ba735c152b66c785128ccaeacef2cec4cee30e271ec23831420af8e23e8999 | 8309 | 任务验收日志 |
| artifacts/logs/FIX-02.txt | c44a3c9297c1ab15d36248f89ead119226249fb474455c785c2cd8ca36989f33 | 13266 | 任务验收日志 |
| artifacts/logs/FIX-03.txt | 45db075cf62c83cc232001a22766f5c0e9caa199ec911585fc14a6f82d5cf9db | 18946 | 任务验收日志 |
| artifacts/logs/FIX-04.txt | a617be5093a287516a8cd781389d0a71584f26c0812e9de64945e1e1f9484ad9 | 5674 | 任务验收日志 |
| artifacts/logs/T001-env.txt | d1f3913738bcb1ab8e8a4232d66141a128af3980cca25019c35e21ba18abe8eb | 7077 | 任务验收日志 |
| artifacts/logs/T002-contract.txt | 21e29e2d814e9647b492c44ddb83abec34dbff53b3ea3da3802b2cb802620f92 | 6416 | 任务验收日志 |
| artifacts/logs/T003-grid.txt | db6c2c7e0a338ef24146be9577544f7c2024c413e2ce81591529f76a15cff4ee | 15379 | 任务验收日志 |
| artifacts/logs/T004-flatten.txt | 0171392c1d64d6b737caa1850920816bf2f30047ca878733b6bd224470df9727 | 10928 | 任务验收日志 |
| artifacts/logs/T005-FIX-01.txt | 6d1265ab505ed9f4d61d5e29292ed2d80cc6615084aa5bd19130eaed1a1d371b | 2452 | 任务验收日志 |
| artifacts/logs/T005-witness.txt | 92dbd10f1fefa156292ecc470dd82513b1deae0085ee046ed60193f7316b0310 | 19676 | 任务验收日志 |
| artifacts/logs/T006-oracle.txt | 282859ac287be5774ea82fd0a849f091c399c18631fe635f914a482bdee22d74 | 34669 | 任务验收日志 |
| artifacts/logs/T007-compare.txt | 5e09bfb58704cad3ab6d7ab213c7a7d474afab9565b956ed7518212e079f8932 | 17603 | 任务验收日志 |
| artifacts/logs/T008-records.txt | 6cc37832401d41a3c8a246d9067541e5083ee4ee39148b38afb1daaf38ee432a | 20179 | 任务验收日志 |
| artifacts/logs/T009-FIX-01.txt | 317ef08ec2eaf45a901b2245a03a0059e1179c5bd5e87a8c4c0750d73b003057 | 12383 | 任务验收日志 |
| artifacts/logs/T009-ui.txt | 2e66d1c3ac56950e336943ce607d62c839c34cc44356f442e33b75512039d994 | 18545 | 任务验收日志 |
| artifacts/logs/T010-worker-cli.txt | b563e98e4b9c42aaca1cfc6b1c73479a0e3a2e7a5ffb93276cd99963f0a80d96 | 20778 | 任务验收日志 |
| artifacts/logs/T011-FIX-01.txt | 7bfb9a22d5d5209802ec4721574fceaedb3ad06280b88d796339247d406ce78b | 10895 | 任务验收日志 |
| artifacts/logs/T011-tests.txt | faf146d8b34b0e702251791fdf9a7639a405c904642f49c326e92f703b26aa80 | 35940 | 任务验收日志 |
| artifacts/logs/T012-cancel-probe.json | ad606f598ff5f3328cecfc1bc333034f31b8c17149b66d238e60ee27a94a3c90 | 350 | 任务验收日志 |
| artifacts/logs/T012-e2e.txt | 12fe820272971160c72fe0ff3665ab35e791e7da862f66e73d166bb34d6a8a2c | 26970 | 任务验收日志 |
| artifacts/logs/T012-FIX-01.txt | d54e436c2a3ad1463fd89775ed5debc89c581e07ed8a91640102652764c5e541 | 6843 | 任务验收日志 |
| artifacts/logs/T012-perf-browser-full-suite-run2.json | 3e3fe1e7004abbf62f40bf16d746aff4b923df05fcb17a639fdc13c0d82c4a6b | 911 | 任务验收日志 |
| artifacts/logs/T012-perf-browser-full-suite.json | 6c8dc2139c85799ebe5203ffd8cb031c4891a467a0c1d96a46c3ed863bd0b77a | 915 | 任务验收日志 |
| artifacts/logs/T012-perf-browser-standalone-run1.json | 435168fc3a94b3648f8d2cef3d7e2eff5d0fb49840974216378109bf0bf875e6 | 1252 | 任务验收日志 |
| artifacts/logs/T012-perf-browser-standalone-run2.json | c2576a72fce5d529ec4ad635c4dc164787d82f49d02eee44897aba7b891a98d7 | 908 | 任务验收日志 |
| artifacts/logs/T012-perf-browser.json | 44d2fa954e879bd1674cc618c1c96b46764c5451f8e9e154be320bd6b4419865 | 910 | 任务验收日志 |
| artifacts/logs/T012-perf-fail-error-context.md | 3a4d7b63aaba9c8919ac26e05ec0e2f513345c4fac47cd1e0bf5adb4e9920da1 | 95380 | 任务验收日志 |
| artifacts/logs/T012-perf-fail-run2-error-context.md | 78a63828d252abeaa18420f7a7f4a18cf09fa79bec529073f88ea58a40efad99 | 95378 | 任务验收日志 |
| artifacts/logs/T013-FIX-01.txt | 3116b02843af61d5773388c1d80e5907876245a82cc374ddd8bee5fa84f9748a | 11758 | 任务验收日志 |
| artifacts/logs/T014-review.txt | 89ba26a21486846943e803380a0eccc733738813e5e3bb55b940e5fa2f35fd20 | 9652 | 任务验收日志 |
| artifacts/screenshots/T009-desktop-A.png | 9756f7930819611b67b7faebc7aae380cb25e12f6b1d87499fb77506227bc9e7 | 294171 | 真实浏览器截图（映射见 SCREENSHOT_INDEX.md） |
| artifacts/screenshots/T009-desktop-C.png | 03d410e3fe808358bd7417550dea41e2378c73d648d8225973b0c4427e99ee93 | 261698 | 真实浏览器截图（映射见 SCREENSHOT_INDEX.md） |
| artifacts/screenshots/T009-desktop-D.png | 80aee3a600a9e25658b71400aeefd69c1c1dba96427fded0ea2e0376c2a5f55e | 164878 | 真实浏览器截图（映射见 SCREENSHOT_INDEX.md） |
| artifacts/screenshots/T009-keyboard-focus.png | 509c228f58e162cd8f66a2774e6962e7dde9ff1368e91a4c0b57f65320eef402 | 148687 | 真实浏览器截图（映射见 SCREENSHOT_INDEX.md） |
| artifacts/screenshots/T009-mismatch-A.png | ef45e5a745078ef4b2b939341f3f75894b222b4e849bb77428bdece4fa3d0dee | 328127 | 真实浏览器截图（映射见 SCREENSHOT_INDEX.md） |
| artifacts/screenshots/T009-mobile390-A.png | 50a43d3912f5a393d5e33c20802c3ca2bee2ae2d65b3401c19a9c6447d61c662 | 296653 | 真实浏览器截图（映射见 SCREENSHOT_INDEX.md） |
| artifacts/screenshots/T012-A-origin-empty.png | 9756f7930819611b67b7faebc7aae380cb25e12f6b1d87499fb77506227bc9e7 | 294171 | 真实浏览器截图（映射见 SCREENSHOT_INDEX.md） |
| artifacts/screenshots/T012-B-repeat-value.png | 276fdff44753239caf450cbdd20348f5cd295d82f755029c1777e5f4e81fe8a9 | 263869 | 真实浏览器截图（映射见 SCREENSHOT_INDEX.md） |
| artifacts/screenshots/T012-C-no-witness.png | 8020f8a45b3442eaab3c499199ce2046ca86ef6ec0babd61fd536d415f359d34 | 258787 | 真实浏览器截图（映射见 SCREENSHOT_INDEX.md） |
| artifacts/screenshots/T012-D-unsupported.png | ed84d70bb66b89827f7ced0617f368ae4958cf8396131778070c28e9e945eed2 | 161913 | 真实浏览器截图（映射见 SCREENSHOT_INDEX.md） |
| artifacts/screenshots/T012-mobile390-A.png | 50a43d3912f5a393d5e33c20802c3ca2bee2ae2d65b3401c19a9c6447d61c662 | 296653 | 真实浏览器截图（映射见 SCREENSHOT_INDEX.md） |
| artifacts/screenshots/T012-perf-fail-run2.png | 747d954263ec42b1acab110c8c494b80d082067d4362caae78c55896cfafd450 | 145408 | 真实浏览器截图（映射见 SCREENSHOT_INDEX.md） |
| artifacts/screenshots/T012-perf-fail.png | 747d954263ec42b1acab110c8c494b80d082067d4362caae78c55896cfafd450 | 145408 | 真实浏览器截图（映射见 SCREENSHOT_INDEX.md） |
| CHANGELOG.md | 92b5ba86d36471ed2d23be5877bfe3e18324ecd8307b9c4a201501a672b3cd49 | 2634 | 清单文件 |
| docs/IMPLEMENTATION_PLAN.docx | 9c00ac9bc9a06df1ff111aa00243b2964ebbaf8c4829a5253e846a8b209d1a88 | 63574 | 规格副本（权威在 bundle/，此处为工作区副本） |
| docs/IMPLEMENTATION_PLAN.md | b22f66ed6538acd084b9c795fb273f837d8eb3fd0a76d66a654f5b485b459565 | 38768 | 规格副本（权威在 bundle/，此处为工作区副本） |
| docs/P029_IDEATION_REPORT.md | 90507d37b09535883f33c058d1d06b3a3da0d923acb672baa58bebe8871c62a0 | 26245 | 规格副本（权威在 bundle/，此处为工作区副本） |
| docs/PROJECT_BOOK.docx | c270ec42fcdf039f169f683d7d152692e4e956a30f6379a41a364b1d498884f7 | 59225 | 规格副本（权威在 bundle/，此处为工作区副本） |
| docs/PROJECT_BOOK.md | b2800047f688c0d914abbcd76ff7016c29c1e3c287c97e09040e829aebaaef63 | 33528 | 规格副本（权威在 bundle/，此处为工作区副本） |
| fixtures/golden/G01.json | 309728ad4d460096f170348587262a9cf448bd5914493c1751172c67dc4320f2 | 276 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G02.json | 2cefd2f02ac9b887370e537f785daacb206408dd9a24984758084e2d8fab6fed | 306 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G03.json | 4afe6d7e2dfef0cc09bf2aeb6bd247b218f509751da129bd2fd8db5770a9b6fe | 361 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G04.json | 5d57a4ac3272dc1568c7e182e1c2b8e21a7f0d01a232f92110ae9bd6218e850b | 291 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G05.json | 9a9f4eb92392f15cd87fa14299e8ddbec11a3993486b95ee15dd723e0d376cea | 242 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G06.json | 1398cadd1dc07c8bb1a6faeaf2345a2d69f3b8c2cfcec239ded6628a09f0a882 | 251 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G07.json | 69fee0d54d31c60257b757d82332326913eca9fbcab0732cb2142bbd25ac4861 | 314 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G08.json | 825dda4ff726e20fa51de22809f3574435dc3597a205e15d62becd013c5a859f | 305 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G09.json | 68c65714d6b50ff408c5eda696da225aa1f1357b03004d5a4c236a62b225e09b | 385 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G10.json | 1a065802b471fb2b0bd608261bb9bf8a3651fae5cf6985387afa18b47161a00a | 364 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G11.json | 2c58a608074003c8ca88953fefb2e54551a4db25492caaae5eeb623b0fcece5d | 305 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G12.json | 757870796aa4324534786dcfa5705616eca40d972190c8417adc75d9e9a0f14f | 356 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G13.json | 1441d5839dc726ef2e7bfee71b1246e2c326f51efbbaf85aeca19016bf26f8bb | 338 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G14.json | ad2cd2b4aebda2ae603a1dc8f05d58452798dc2797c59ea1f2e13cec22ee7276 | 418 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G15.json | ab4ba2b4ae973c13a339aa9cb87db3122d4e7b3654dc39ba47edc5c2f839bc94 | 299 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G16.json | 037dea332d5807435ab696ea088d645e13c56c18dcd5441eaf3ffeb31c0832d4 | 328 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G17.json | 4374131626aedc935a4c9a535cab9988ac87f5bb6be9ff9df18ab57fb69d7149 | 357 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G18.json | ea03170943d711649dc84764a5cddd993a1378790b5bf502d632943c10831b75 | 301 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G19.json | 317a8f373eb39ab841320b86b11136bd62e7b540c0ad429e41e8efa9a3145eee | 330 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G20.json | 362310e94e5a018c6712d54ed2680eb664cfa45b787d1546f394cc5575daa340 | 330 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G21.json | a6b7b87b99b626b1f11d89feb357e4545920a927b379222ba37bc4a3b932fd10 | 293 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G22.json | 127cc574822e279c008d213ce3640959f7c1f77caaa15311689c828dd3b4aec7 | 359 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G23.json | 101d1d147b3d4ea4f655aed3e63b1586053fc611e42749f02472195b05d8550c | 296 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G24.json | c154b9ce6c5725f48fba339cf44d9684584fbd6b522732a85c217b9adfd3e495 | 390 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G25.json | a8a5d4c39c89f50eeb427dfd0a7ab61a671f23a86f1b6fb3282991955bb02be8 | 391 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G26.json | 27a6963e7d2a6cea91a69be799871c36c48151df391a4f2033bca97e0f1ba791 | 354 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G27.json | e10093a13f5978820bb2076dbeeac5762de99a3aa678ecff15b570df6b470280 | 328 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G28.json | d68c8bc8d90ae443f55a28e8acfdf4485eceefc92f53d7748cfec2a58fd181e4 | 346 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G29.json | 8077620aac5a915dd05d720fc9748cddd9f340d2f3b3c33c5f06fb8327fe9284 | 395 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G30.json | 1d9fbce342eee7b1a05afe2d34fe9cee9518d805631a497ef6a74a0fc60a03df | 382 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G31.json | abd99dc02e26896d99cbe0c02432131f589e4d102317f3cb552e51523f9a8841 | 411 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G32.json | 93a1be32ac66fada8d61bbd4667bee606e8983d8fa18d4833fd0f339aa3f6bbf | 339 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G33.json | 385110fd29e3b04caaa17d6e78e7452dab5d4f702701f67a2d9b72444b061c44 | 285 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G34.json | fc84c57277f308bf7baa5d5b7be3e57a43210f100a98d71dd04ef6156684997c | 306 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G35.json | 9a99525526cccb2a8e554d48aaf31818aa273cdd9c24b2bf5e597788425a2f1f | 332 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G36.json | 61ef7ff185872df2da70596632c7054c339dc611485ce1fa72d7cceeeba3f519 | 326 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G37.json | 28a11ab342d50f3e5e001dc0ccd57e37efaa458d584b604271d9e24793dc0a07 | 303 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G38.json | d2063d6552a41da81a3f907550c67d4e5ff16000e425e319d7fa36dafc4381c7 | 271 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G39.json | 6eaa513022a8eea079a39f7152a04118748c270b59ddc9c68d6f69f310636812 | 300 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G40.json | a85cf92cba2d212f8865dac64f99864fdb8f7bf00dec199eb6aaafcb26fe1995 | 368 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G41.json | 023ee77f32576f57a7647516e5d3156399fae6482996a0d5cad43768e45eec10 | 272 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G42.json | e31d35c7071fc9810269d999b19cd7895e81e859501a721caec71e31aff52e72 | 294 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G43.json | b9382bb81fc7568854ad37c2b0c73fe46cd87c09824071c3a6822bdf802af243 | 266 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G44.json | 73e786f49bd383558bc8598aae5ac6387a5906dad2a1ed9746aec4915e9430b1 | 251 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G45.json | 0be66e215b6d7ec061c1f50127ea09a2c9f97b8fc272e71745cd6bf8791f2865 | 252 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G46.json | 59b19ba0b789ae0c9899a953038df15e2e6e40175503c435354f37454533f463 | 266 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G47.json | 68d6da0c2016a2f967176a17b17a1e2174db4bd2fb81a0c5951f62918d63ee13 | 305 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G48.json | 2d2ebe11ae8e431c700c6bdf312c88f279c37b7352091ae7274eff094d4e9c09 | 361 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/golden/G49.json | a26f25b261921b007602b353ac17485c771723c9c7daf7deb0a41a6aca41eaf8 | 266 | Golden 输入（Oracle 49/49 预期见 oracle/golden_expected.json） |
| fixtures/TFK-A.json | b073ef6cb38917591296ee4b20271c8ab8f3b98f094741f88815f7fd725be0e5 | 387 | 演示预设输入 |
| fixtures/TFK-B.json | 07c9964f8465783d8227a6830d3021199491d19ea32be375094dbea3283a6da9 | 363 | 演示预设输入 |
| fixtures/TFK-C.json | 96e15f386b015a2160d607c497fb4583887c8f39dc8ad61ef13b3abd78550ebb | 339 | 演示预设输入 |
| fixtures/TFK-D.json | 4900fe04065f741784bff145860f5fdde477ab6481a4d398e8917550650b77da | 360 | 演示预设输入 |
| LICENSE | 4341c1caa5f54b29baf49e59b55d482363e1ff86cd37dbffa26912d36e4a12a4 | 1079 | 清单文件 |
| oracle/golden_expected.json | bcfb36ea7d6ee2d5a71d8c15e1fba58011d0a885a917e688feacc2a00790d6ce | 272864 | Oracle 手算预期（49 条） |
| package-lock.json | 80a86c951542fc09006c2f7e44f8686bf03f561935fbfe2e34b72e9e05d7974f | 76941 | 锁文件（机器生成；SHA 见清单） |
| README.md | b956465a3f577bc187a4fab0d8987297811d9ebce5d9c9315be63ebff1f753e8 | 5589 | 清单文件 |
| review/FINAL_REVIEW_R1_MESSAGE_DRAFT.md | edf103834a66659f228b23b75c9f454bbd63e88bd23ee12345318080e4666653 | 8323 | 终审文件 |
| review/INDEPENDENT_REVIEW.md | b68ab8a1b1559796242a4e27dd2db1cfae6380fa74741e9bde03ebc166f76448 | 28877 | 终审文件 |
| review/REVIEW_INDEX.md | 85f389cb52627965e3480429725ab59b53ed8dcf01b3ffba652a8c2204e1e20f | 29655 | 终审文件 |
| review/REVIEW_PACK_01.md | 9129100f1a3c7db409ef61811731ad0d17c0b0c714340243db8f1e1d801110ba | 107849 | 终审文件 |
| review/REVIEW_PACK_02.md | b7343c54fedb0ffa13c123cd1e3ccff7a44410fb94409997f7e8b9e627d7ab78 | 86816 | 终审文件 |
| review/REVIEW_PACK_03.md | aa87e06d2798625d4df58bd7edceff9c511de328aee7fc7e1ad5c0f49cb49005 | 117646 | 终审文件 |
| review/REVIEW_PACK_04.md | d5502dde61bbf5a245c21d39b731f5e957f01fe8ecbeed17c23658b74e610859 | 60665 | 终审文件 |
| review/REVIEW_PACK_05.md | 684a78fdf08ec5e103325f853c41bddd4e7b1b2bb993cc6dfaba3afe7c2357ad | 85291 | 终审文件 |
| review/SCREENSHOT_INDEX.md | bb4a9c5a6d2fe48258511c9cf3f305cbe257bc9d5c220046a6459d31cceec8cc | 5275 | 终审文件 |
| SECURITY.md | 6e9d640d13b84f14c111a8b8b66efde44a2fd69cbd2595a9958d34c2664fbbd6 | 3825 | 清单文件 |
| T012-performance.json | c2c8a5670dd75eac536590797f9d926ccc516e98fdb1d8c0cc812b1d614b995d | 10700 | 性能六组数据集（T013 不改写） |
| task_handoffs/P029-FIX-01.json | 24ad767ac89c6587e7126bbea80bdd33154b30549d3efc886db9d51080c07dbe | 4873 | 任务交接记录 |
| task_handoffs/P029-FIX-02.json | 40dcc3ffc6352e6fe1f726434326ae9225fe6c25d657f1e92525dadf00f8804c | 5022 | 任务交接记录 |
| task_handoffs/P029-FIX-03.json | dd99101ab49f2114c6111e40f148811ad25d304899057d5fcd628c30b7eb5c86 | 6025 | 任务交接记录 |
| task_handoffs/P029-FIX-04.json | 0b3c55ff4e8d59718a006c59dbf1b2152dfc2f2b638ddabd29e0c07e976a312d | 2821 | 任务交接记录 |
| task_handoffs/P029-T001.json | b206ffadad8d48ca87bda2302e9de39ec016cc8571029d86039941f2a26a1470 | 3597 | 任务交接记录 |
| task_handoffs/P029-T002.json | 09775f9c0dcf0d1a5f2de2608caf8134bb2d223c2cddd291fb336d6719354697 | 1886 | 任务交接记录 |
| task_handoffs/P029-T003.json | 27da00c65d17d19ff6a2b7cec59eeb1fed8203b38f5506a20923ffa322bc00f4 | 3490 | 任务交接记录 |
| task_handoffs/P029-T004.json | 007195c9bdc34ba8318085a37abdc2dc8ca00df550597ee14a4d02295e6627df | 2964 | 任务交接记录 |
| task_handoffs/P029-T005.json | 64d96395bbb5c72c88046a022e7c986d5ef09192a55990be6903b83f2b01d19c | 4141 | 任务交接记录 |
| task_handoffs/P029-T006.json | 87ff87529a7b4f0fdc4fbb01ae8e9bb91e53ab17434622f5505b808379517095 | 3462 | 任务交接记录 |
| task_handoffs/P029-T007.json | 6e9e19babc828555b418ab67a6b95ff163f1b73ecf623a7c5ae221463f62cdc5 | 2741 | 任务交接记录 |
| task_handoffs/P029-T008.json | aba62b2d2ecddaaf799b4af50f56569086627ff8b29ab11407eb14c2f23b2601 | 3204 | 任务交接记录 |
| task_handoffs/P029-T009-FIX-01.json | 494a59fbd30239c61a735559425100d644c5298bf3f28884f4b08d42fa2d8abf | 5005 | 任务交接记录 |
| task_handoffs/P029-T009.json | 828d7d9521865b024e69d8781fe81ea36f00a35ce6f5ee9a9c9c9815c446e13e | 3347 | 任务交接记录 |
| task_handoffs/P029-T010.json | da3ff70147956c0bf99c45ddc11c24176b89893cf9349c57c50cf0b5c785644c | 3964 | 任务交接记录 |
| task_handoffs/P029-T011-FIX-01.json | 24e0aa3926441863aa491a6ef768e08773c42761a5d54d105a91d81a99fa4980 | 3794 | 任务交接记录 |
| task_handoffs/P029-T011.json | f7204db05a26ba1da48460bf2c14c4994b915084d7e87af2aa593fcf8a9b37b8 | 6046 | 任务交接记录 |
| task_handoffs/P029-T012-FIX-01.json | 685fa645d8296a68210b67afbbae79a39a6f0d618ece3add40b14f884806a9ea | 3700 | 任务交接记录 |
| task_handoffs/P029-T012.json | 088b9bd0aebe655141df5d8b599b655e2e7a7340a8e57d7bc80945db3d0f26fc | 6382 | 任务交接记录 |
| task_handoffs/P029-T013-FIX-01.json | ed2d1fc193f0d623a1b8362fab29b31b4f177791c2b88e010a58844ba2700177 | 9441 | 任务交接记录 |
| task_handoffs/P029-T013.json | c828bc576ca44e70ca694e25d75b2428a336cd6bba4a556b2a863541c44e3565 | 7931 | 任务交接记录 |
| task_handoffs/P029-T014.json | 23bdb8987325586d23f18ba63bec68323d14e9e2c034af5e36b8ece095771d70 | 9978 | 任务交接记录 |
| THIRD_PARTY_NOTICES.md | 27e8218b98310c9446851cfc1e557ddc62693688d443025f1a57cffeb71be9dc | 9054 | 清单文件 |

## 未覆盖（不在清单中，有意排除，见 RELEASE_MANIFEST.json）

- `artifacts/release/*.zip`：发布输出本身（哈希见清单与交接 JSON）。
- `review/RELEASE_MANIFEST.json`：清单记录源码 ZIP 自身的哈希，自指故不装入 ZIP。
- `artifacts/logs/T013-release.txt`：日志记录两 ZIP 的哈希，自指故不装入 ZIP。
- `artifacts/logs/REFREEZE-FIXR1.txt`：重冻结验收日志（记录两 ZIP 的哈希），写于清单生成之后，不在本次清单中。
- `bundle/`、`drive-copies/`、`v1.0.0-archive/`：冻结规格归档副本，非源码。
- `node_modules/`、`dist/`、`test-results/`、`oracle/__pycache__/`：生成物。
- `S0_REPORT.md`、`COORDINATOR_LOG.md`：协调员文件，未跟踪，不进发布包。
