# TableFork — 截图索引（SCREENSHOT_INDEX）

> 全部截图在 `artifacts/screenshots/`，均为真实 Chromium 渲染（非合成图）。
> `tests/e2e/` 下无截图文件（只有测试代码与性能表定义）。截图 SHA-256 与
> 字节数由本索引生成时实测；与 T009 / T012 日志记录一致（见各行备注）。
> P029-REFREEZE 重拍 11 张：顶栏由“规格 v1.0.1”改为“规格 v1.0.2”，其余像素
> 逐点核对一致（每张差异仅版本字形 48–49 像素，见 artifacts/logs/REFREEZE-FIXR1.txt）。
> T012-perf-fail 两张为 T012 历史失败证据：画面内无版本字样，FIX-01～04 未改动
> 画面内容，保留原图。导出 JSON 标签页（默认未展开）现含 jobId / inputHash /
> specVersion（FIX-02，规格 v1.0.2）；现有截图均为默认“逐格交接稿”标签页，
> 故不另增截图，JSON 内容由 export JSON e2e 测试断言。

| 截图 | 输入 | 策略 | 预期结果 | 备注 | SHA-256 | 字节数 |
|---|---|---|---|---|---|---|
| T009-desktop-A.png | TFK-A | ORIGIN_EMPTY | CERTIFIED_COLLISION（合并 vs 拆分双表） | 桌面 1280x900，T009 原图；P029-REFREEZE 重拍，Chromium 159.0.8154.6（仅顶栏版本字形变化） | 9756f7930819611b67b7faebc7aae380cb25e12f6b1d87499fb77506227bc9e7 | 294171 |
| T009-mismatch-A.png | TFK-A（M 末值 80→81） | ORIGIN_EMPTY | MISMATCH + 首个不同字节定位 | 桌面，T009 原图；P029-REFREEZE 重拍（原索引“M 改 120→81”写法不准：图中 M 末行是 120、81，F(A) 末行是 120、80，见 REFREEZE-FIXR1.txt） | ef45e5a745078ef4b2b939341f3f75894b222b4e849bb77428bdece4fa3d0dee | 328127 |
| T009-desktop-C.png | TFK-C | ORIGIN_EMPTY（策略无关） | NO_WITNESS_FOUND，「无 B 表」「不表示保真」 | 桌面，T009 原图；P029-REFREEZE 重拍（含下载 JSON 后的“已下载 JSON 报告。”提示语） | 03d410e3fe808358bd7417550dea41e2378c73d648d8225973b0c4427e99ee93 | 261698 |
| T009-desktop-D.png | TFK-D | ORIGIN_EMPTY（策略无关） | UNSUPPORTED + UNSUPPORTED_HEADER_SEMANTICS | 桌面，T009 原图；P029-REFREEZE 重拍（下载提示由同一会话先前的下载保留；D 本身无可下载报告） | 80aee3a600a9e25658b71400aeefd69c1c1dba96427fded0ea2e0376c2a5f55e | 164878 |
| T009-keyboard-focus.png | 空态（未输入），页顶 Tab 22 次 | ORIGIN_EMPTY | 键盘焦点：页顶 Tab 22 次后焦点框可见 | 桌面，T009 原图；P029-REFREEZE 重拍（焦点落在 ORIGIN_EMPTY 单选框；原索引“分析后”写法不准，图中输入为空） | 509c228f58e162cd8f66a2774e6962e7dde9ff1368e91a4c0b57f65320eef402 | 148687 |
| T009-mobile390-A.png | TFK-A | ORIGIN_EMPTY | CERTIFIED_COLLISION，纵向折叠，无横向溢出 | 视口 390x844，T009 原图；P029-REFREEZE 重拍（仅顶栏版本字形变化） | 50a43d3912f5a393d5e33c20802c3ca2bee2ae2d65b3401c19a9c6447d61c662 | 296653 |
| T012-A-origin-empty.png | TFK-A | ORIGIN_EMPTY | CERTIFIED_COLLISION（合并 vs 拆分双表） | 桌面，T012 新鲜截取；P029-REFREEZE 由 e2e 套件重跑；与 T009-desktop-A.png 哈希相同（同一 Chromium 确定性渲染，非复制，见 T012-e2e.txt §3） | 9756f7930819611b67b7faebc7aae380cb25e12f6b1d87499fb77506227bc9e7 | 294171 |
| T012-B-repeat-value.png | TFK-B | REPEAT_VALUE | CERTIFIED_COLLISION + STRUCTURAL_COLLISION；交接稿含 [R1C1 source=c03] 行标题: 部门X | 列标题: 数值 | 数值: a | 桌面，T012（已目视核对）；P029-REFREEZE 由 e2e 套件重跑（仅顶栏版本字形变化） | 276fdff44753239caf450cbdd20348f5cd295d82f755029c1777e5f4e81fe8a9 | 263869 |
| T012-C-no-witness.png | TFK-C | ORIGIN_EMPTY（策略无关） | NO_WITNESS_FOUND，「无 B 表」 | 桌面，T012；P029-REFREEZE 由 e2e 套件重跑（未下载 JSON，故无提示语；与 T009-desktop-C.png 的区别仅此提示语与顶栏） | 8020f8a45b3442eaab3c499199ce2046ca86ef6ec0babd61fd536d415f359d34 | 258787 |
| T012-D-unsupported.png | TFK-D | ORIGIN_EMPTY（策略无关） | UNSUPPORTED + UNSUPPORTED_HEADER_SEMANTICS | 桌面，T012；P029-REFREEZE 由 e2e 套件重跑（未下载 JSON，故无提示语；与 T009-desktop-D.png 的区别仅此提示语与顶栏） | ed84d70bb66b89827f7ced0617f368ae4958cf8396131778070c28e9e945eed2 | 161913 |
| T012-mobile390-A.png | TFK-A | ORIGIN_EMPTY | CERTIFIED_COLLISION，窄屏纵向折叠，无横向溢出 | 视口 390x844，T012；P029-REFREEZE 由 e2e 套件重跑；与 T009-mobile390-A.png 哈希相同（同上） | 50a43d3912f5a393d5e33c20802c3ca2bee2ae2d65b3401c19a9c6447d61c662 | 296653 |
| T012-perf-fail.png | 32×12 性能表 | ORIGIN_EMPTY | 性能断言失败瞬间（全套 run A，p95 527.4ms > 500ms，测量污染，已由 T012-FIX-01 隔离法闭合） | 桌面，T012；与 run2 图逐字节相同；历史失败证据，保留原图（画面内无版本字样） | 747d954263ec42b1acab110c8c494b80d082067d4362caae78c55896cfafd450 | 145408 |
| T012-perf-fail-run2.png | 32×12 性能表 | ORIGIN_EMPTY | 性能断言失败瞬间（全套 run B，p95 649.2ms > 500ms，同上） | 桌面，T012；历史失败证据，保留原图（画面内无版本字样） | 747d954263ec42b1acab110c8c494b80d082067d4362caae78c55896cfafd450 | 145408 |
