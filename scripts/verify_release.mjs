/**
 * P029 TableFork — 发布验证 (P029-T013)
 *
 * 唯一权威：IMPLEMENTATION_PLAN.md §6 P029-T013 卡、§10.2（REVIEW_INDEX
 * 须逐文件列出 SHA-256 与行数）、PROJECT_BOOK.md §7.2 / §11。
 *
 * 本脚本真实校验发布包，全部检查失败即 exit 1（`npm run verify:release`
 * 必须 exit 0 才算验收通过）：
 *
 * (a) 源码 ZIP 是冻结提交的忠实归档：
 *     - 清单（review/RELEASE_MANIFEST.json）列出的文件集合 == 按排除
 *       规则扫描工作区的源码集合（100%，不多不少）；
 *     - 每个清单文件的 SHA-256 / 字节数 == 工作区文件实测；
 *     - ZIP 内条目集合 == 清单，逐条解包重算 SHA-256 == 清单；
 *     - 清单文件凡已在 git HEAD 中有记录者，其 SHA-256 == `git show HEAD:<path>`
 *       的实测（提交前的新文件只按工作区核对，并在报告中点名）；
 *     - 若全部清单文件都已在 HEAD 中，另用 `git archive HEAD`（同款
 *       pathspec 排除）新鲜归档并逐文件比对内容哈希。
 * (b) dist ZIP 与一次全新构建一致：脚本内真实跑 `npm run build`，再用
 *     同款确定性打包重打 dist ZIP，逐字节比对 SHA-256。
 * (c) 清单列出 100% 源码路径且逐文件 SHA-256 正确（即检查 (a) 的前两项）。
 *     可重跑性：清单冻结打包时刻的集合；此后新增文件（如 commit 2 的
 *     交接 JSON、T014 的独立审查报告）只警告、不失败——它们不在本次
 *     发布包内，但不使已冻结的集合失实；清单文件缺失/被改仍是 FAIL。
 *     例外：VOLATILE_RUN_OUTPUTS（每次 e2e 运行都会覆盖的两个运行输出
 *     文件）不参与“清单哈希与工作树一致”一项的比对，理由见该常量注释；
 *     清单/ZIP/HEAD 三方比对照常覆盖它们（ISSUE-T013-6）。
 * (d) REVIEW_PACK 各卷哈希与发布包一致：每卷的 SHA-256 == 清单记录；
 *     每卷内每个文件块的 SHA-256 == 清单中该源码文件的 SHA-256；
 *     全部代码文本文件恰好出现在一卷中，不多不少；
 *     REVIEW_INDEX.md 的分卷表与各卷实测一致。
 *
 * 自指排除（写在清单 `excluded_from_source_zip` 里，不是悄悄省略）：
 * 源码 ZIP 不装入三类文件——`artifacts/release/*.zip`（发布输出本身）、
 * `review/RELEASE_MANIFEST.json`（清单记录源码 ZIP 自身的哈希）、
 * `artifacts/logs/T013-release.txt`（日志记录两 ZIP 的哈希）；三者都在
 * Git 提交中，可独立核对（发布 ZIP 的权威哈希见清单自身的
 * source_zip / dist_zip 字段，不指向任何交接 JSON）。
 * 其余排除：`.git`、`node_modules`、`dist`、`test-results`、
 * `bundle/`、`drive-copies/`、`v1.0.0-archive/`（冻结归档副本，非源码）、
 * 根目录 `P029_SPEC_BUNDLE.zip`（规格包副本）、未跟踪的协调员文件
 * `S0_REPORT.md` / `COORDINATOR_LOG.md`、`oracle/__pycache__/`。
 *
 * 确定性打包：ZIP 由内嵌 Python 脚本（zipfile）生成，条目按路径排序、
 * 时间戳固定为 1980-01-01、统一 deflate 等级；同一文件集合两次打包
 * 逐字节相同，可复现。
 *
 * 本文件同时导出打包函数（`computeSourceSet` / `sha256File` /
 * `deterministicZip`），供发布打包步骤复用同一口径；直接运行时执行检查。
 */

import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SPEC_VERSION = '1.0.2';
export const BASE_COMMIT = '6c81860';
export const MANIFEST_SCHEMA = 'tablefork.release-manifest/v1';
export const SOURCE_ZIP_NAME = `tablefork-source-${BASE_COMMIT}.zip`;
export const DIST_ZIP_NAME = `tablefork-dist-${BASE_COMMIT}.zip`;

/** 源码集合扫描的排除规则（相对路径，前缀匹配；另见文件头自指排除）。 */
export const EXCLUDED_PREFIXES = [
  '.git/',
  'node_modules/',
  'dist/',
  'test-results/',
  'bundle/',
  'drive-copies/',
  'v1.0.0-archive/',
  'artifacts/release/',
  'oracle/__pycache__/',
];
export const EXCLUDED_FILES = new Set([
  'P029_SPEC_BUNDLE.zip',
  'S0_REPORT.md',
  'COORDINATOR_LOG.md',
  'review/RELEASE_MANIFEST.json',
  'artifacts/logs/T013-release.txt',
]);

/**
 * 每次 e2e 运行都会覆盖的运行输出文件（ISSUE-T013-6）：
 * `npm run test:e2e`（功能项目）重写 `artifacts/logs/T012-cancel-probe.json`
 * （取消探测结果），`npm run test:e2e:perf`（隔离性能项目）重写
 * `artifacts/logs/T012-perf-browser.json`（30 次性能原始值）；因此任何
 * 一次 e2e 运行后，工作树里这两个文件的字节/哈希都会与清单不一致——
 * 这不是发布包被篡改，只是运行输出的自然更新。已提交版本仍是记录证据，
 * 清单、源码 ZIP 与 git HEAD 三方比对（检查 a）照常覆盖这两个文件，
 * 一字不放宽。仅“清单哈希与工作树一致”这一项跳过它们，否则
 * verify:release 在每次 e2e 运行后都会误报 FAIL。
 */
export const VOLATILE_RUN_OUTPUTS = new Set([
  'artifacts/logs/T012-perf-browser.json',
  'artifacts/logs/T012-cancel-probe.json',
]);

/**
 * 清单 notes 模板（ISSUE-T014-1 / P029-FIX-03，R1 P2；
 * 措辞修正见 P029-REFREEZE-NOTES-FIX；排除枚举补“交接 JSON”见
 * P029-REFREEZE-NOTES-FIX2，T015 P2-03；同卡重验新冻结树时又差
 * review/INDEPENDENT_REVIEW_R2.md 1 个文件，故枚举再补“独立审查报告”
 * 一类——入树但不在 192 清单内的独立审查报告均属此类）。
 *
 * 背景：本文件此前并无生成 manifest notes 的模板——旧清单
 * review/RELEASE_MANIFEST.json 的 notes 是 T013 打包时一次性手写的，
 * 其第二句（“源码 ZIP 内容与 packaged_from_head 的树逐文件核对
 * （npm run verify:release 检查 a）”）口径不精确：verify 的检查 (a)
 * 实际拿 ZIP 对 git HEAD（冻结提交）比对，不是直接对 packaged_from_head；
 * 且 ZIP 与 packaged_from_head 的树确有 2 文件之差（见下）。独立审查
 * review/INDEPENDENT_REVIEW.md §8 已逐字记录，建议“下次重打时改一句注释”。
 * 本卡在此确立唯一的 notes 模板：重冻结卡生成新清单时必须调用
 * buildManifestNotes() 生成 notes，不得再手写沿用旧句。本卡不改
 * review/RELEASE_MANIFEST.json（旧冻结，重冻结卡重新生成）。
 *
 * 精确口径（以下四点缺一不可）：
 * 1. packaged_from_head 是生成清单与源码 ZIP 时的 HEAD 提交——不是
 *    “源码 ZIP 所打包的树的提交”的简写：两者可能差打包时机械重生成的
 *    文件（R1 实例：packaged_from_head c1af873，ZIP 的树是冻结提交
 *    f53cef4，差 2 个文件——review/REVIEW_INDEX.md 与
 *    review/REVIEW_PACK_05.md）。
 * 2. 若 packaged_from_head 的树与 ZIP 的树不同，差的文件必须逐个列出，
 *    且只能是打包时机械重生成的文件；冻结提交本身不在生成时点名哈希——
 *    清单生成时冻结提交尚不存在（它由随后提交清单与 ZIP 的那次提交才
 *    成为冻结提交），notes 只写“冻结提交以 handoffRef 所指 result_commit
 *    为准”。P029-REFREEZE 的教训：旧模板有个 frozenCommit 参数，重冻结
 *    生成器传入打包时 HEAD 的短哈希 b7e1023，notes 便把打包时 HEAD 提交
 *    写成“冻结提交 b7e1023”——但真正的冻结提交是随后提交的 ca8bed6；
 *    误标已被 R1 的 GPT 终审在 ISSUE-T014-1 要求过的口径明确性所不容，
 *    故本修正删除 frozenCommit 参数，杜绝此类误标。
 * 3. verify 检查 (a) 的比对对象是 git HEAD（冻结提交），不是
 *    packaged_from_head——notes 不得再写“ZIP 内容与 packaged_from_head
 *    的树逐文件核对”。
 * 4. 机械重生成文件数为 0 时，写干净的句子“打包时无机械重生成文件”，
 *    不得渲染成“生成的 （0 个文件）”这类空格加括号的别扭写法。
 * 另：第一句须写清 base_commit 的定义——本次冻结的工作基线提交
 * （T013 的 base_commit；FIX-04 的 handoff 提交）。
 */
export function buildManifestNotes({
  baseCommitShort,
  packagedFromHead,
  regeneratedFiles,
  handoffRef,
  generatedBy,
}) {
  const files = [...regeneratedFiles];
  const treeClause =
    files.length === 0
      ? '源码 ZIP 所打包的是打包时的工作树：其内容等于 packaged_from_head 的树；打包时无机械重生成文件。'
      : `源码 ZIP 所打包的是打包时的工作树：其内容等于 packaged_from_head 的树 + 打包时机械重生成的文件（${files.join(' 与 ')}，${files.length} 个文件）。`;
  return (
    `源码 ZIP 文件名中的短 SHA 为本次冻结的工作基线提交 ${baseCommitShort}（T013 的 base_commit；FIX-04 的 handoff 提交）。` +
    `packaged_from_head：生成清单与源码 ZIP 时的 HEAD 提交（${packagedFromHead}）。` +
    treeClause +
    `除清单自指排除的文件（清单自身、发布 ZIP、重冻结日志、交接 JSON、独立审查报告）外，与冻结发布提交的树逐文件一致（冻结提交以 ${handoffRef} 所指 result_commit 为准）。` +
    `verify:release 检查 (a) 拿 ZIP 对 git HEAD（冻结提交）比对，不是直接对 packaged_from_head。` +
    `冻结发布提交（result_commit）见 ${handoffRef}。` +
    `本清单由 ${generatedBy} 从修复提交重新生成。`
  );
}

/**
 * 当前实例的 notes 准确措辞（供重冻结卡直接采用；仅当本实例的提交号与
 * 文件仍适用时——新实例须按实际值重新调用 buildManifestNotes）：
 *
 * 源码 ZIP 文件名中的短 SHA 为本次冻结的工作基线提交 4025061
 * （T013 的 base_commit；FIX-04 的 handoff 提交）。
 * packaged_from_head：生成清单与源码 ZIP 时的 HEAD 提交
 * （c1af8736989418b863b9b762535dd9128b3a7b5e）。
 * 源码 ZIP 所打包的是打包时的工作树：其内容等于 packaged_from_head 的树 +
 * 打包时机械重生成的文件（review/REVIEW_INDEX.md 与
 * review/REVIEW_PACK_05.md，2 个文件）。
 * 除清单自指排除的文件（清单自身、发布 ZIP、重冻结日志）外，与冻结发布
 * 提交的树逐文件一致（冻结提交以 task_handoffs/P029-T013-FIX-01.json
 * 所指 result_commit 为准）。
 * verify:release 检查 (a) 拿 ZIP 对 git HEAD（冻结提交）比对，不是直接对
 * packaged_from_head。
 * 冻结发布提交（result_commit）见 task_handoffs/P029-T013-FIX-01.json。
 * 本清单由 P029-T013-FIX-01 从修复提交重新生成。
 *
 * 调用示例：
 * buildManifestNotes({
 *   baseCommitShort: '4025061',
 *   packagedFromHead: 'c1af8736989418b863b9b762535dd9128b3a7b5e',
 *   regeneratedFiles: ['review/REVIEW_INDEX.md', 'review/REVIEW_PACK_05.md'],
 *   handoffRef: 'task_handoffs/P029-T013-FIX-01.json',
 *   generatedBy: 'P029-T013-FIX-01',
 * })
 */

/** REVIEW_PACK 收录的代码文本：手写代码与配置文本（其余清单文件只列入 REVIEW_INDEX）。 */
export function isCodeTextFile(relPath) {
  if (relPath === 'package.json' || relPath === 'tsconfig.json') return true;
  if (relPath === 'vite.config.ts' || relPath === 'playwright.config.ts') return true;
  if (relPath === 'index.html') return true;
  if (relPath === 'scripts/verify_release.mjs') return true;
  if (relPath.startsWith('src/') || relPath.startsWith('cli/')) return true;
  if (relPath.startsWith('tests/')) return true;
  if (relPath === 'oracle/reference.py') return true;
  return false;
}

export function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

export function sha256File(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

export function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** 按排除规则扫描工作区，返回排序后的源码相对路径（POSIX 分隔符）。 */
export function computeSourceSet(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).split(sep).join('/');
      if (entry.isDirectory()) {
        if (EXCLUDED_PREFIXES.some((p) => `${rel}/`.startsWith(p))) continue;
        walk(abs);
      } else if (entry.isFile()) {
        if (EXCLUDED_FILES.has(rel)) continue;
        if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) continue;
        out.push(rel);
      }
    }
  };
  walk(root);
  out.sort();
  return out;
}

/** 内嵌确定性打包 Python 脚本：用法 deterministicZip.py <baseDir> <listFile> <outZip>。 */
const ZIP_PY = `import sys, zipfile
base, listfile, out = sys.argv[1], sys.argv[2], sys.argv[3]
names = [l.rstrip('\\n') for l in open(listfile, encoding='utf-8') if l.strip()]
names.sort()
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name in names:
        import os
        p = os.path.join(base, *name.split('/'))
        data = open(p, 'rb').read()
        info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, data)
`;

/**
 * 确定性打包：把 baseDir 下的 relPaths（相对路径）打成 outZip。
 * @returns {{ bytes: number, sha256: string }}
 */
export function deterministicZip(baseDir, relPaths, outZip) {
  const tmp = join(tmpdir(), `tablefork-zip-${process.pid}-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const py = join(tmp, 'dzip.py');
  const list = join(tmp, 'list.txt');
  writeFileSync(py, ZIP_PY, 'utf8');
  writeFileSync(list, `${[...relPaths].sort().join('\n')}\n`, 'utf8');
  execFileSync('python3', [py, baseDir, list, outZip], { stdio: 'pipe' });
  const st = statSync(outZip);
  return { bytes: st.size, sha256: sha256File(outZip) };
}

/** 列出 ZIP 内条目（相对路径），用内嵌 Python 读 central directory。 */
export function listZipEntries(zipPath) {
  const tmp = join(tmpdir(), `tablefork-ziplist-${process.pid}-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const py = join(tmp, 'zlist.py');
  writeFileSync(
    py,
    "import sys, zipfile\nprint('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))\n",
    'utf8',
  );
  const out = execFileSync('python3', [py, zipPath], { encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter((s) => s !== '').sort();
}

/** 解包 ZIP 到 outDir（内嵌 Python），返回条目相对路径。 */
export function extractZip(zipPath, outDir) {
  mkdirSync(outDir, { recursive: true });
  const tmp = join(tmpdir(), `tablefork-zipex-${process.pid}-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const py = join(tmp, 'zx.py');
  writeFileSync(
    py,
    "import sys, zipfile\nzipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])\n",
    'utf8',
  );
  execFileSync('python3', [py, zipPath, outDir], { stdio: 'pipe' });
  return listZipEntries(zipPath);
}

function git(args, root) {
  return execSync(`git ${args}`, { cwd: root, encoding: 'utf8' }).trim();
}

function check(name, ok, detail, failures) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
  return ok;
}

export function runChecks() {
  const root = repoRoot();
  const failures = [];
  console.log(`TableFork verify:release — spec ${SPEC_VERSION}, base ${BASE_COMMIT}`);
  console.log(`repo: ${root}`);

  const head = git('rev-parse HEAD', root);
  const headShort = git('rev-parse --short HEAD', root);
  console.log(`git HEAD: ${head} (short ${headShort})`);

  // ---- 0. 清单读取与基本字段 ----
  const manifestPath = join(root, 'review', 'RELEASE_MANIFEST.json');
  if (!existsSync(manifestPath)) {
    check('manifest exists', false, 'review/RELEASE_MANIFEST.json 缺失', failures);
    console.log('RESULT: FAIL');
    return 1;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  check('manifest schema', manifest.schema === MANIFEST_SCHEMA, manifest.schema, failures);
  check('manifest spec_version', manifest.spec_version === SPEC_VERSION, manifest.spec_version, failures);
  check('manifest base_commit', manifest.base_commit === BASE_COMMIT, manifest.base_commit, failures);
  const manifestFiles = [...(manifest.files ?? [])].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  check('manifest files non-empty', manifestFiles.length > 0, `${manifestFiles.length} files`, failures);

  // ---- (c) 清单 == 100% 源码集合；逐文件 SHA-256 与工作区一致 ----
  // 方向是不对称的（fail-closed，但可重跑）：
  // - 清单文件在工作区缺失或哈希不符 → FAIL（发布包被篡改/损坏）；
  // - 工作区比清单多出文件 → WARN，不失败：清单冻结的是打包时刻的
  //   源码集合；此后新增的文件（如 commit 2 的交接 JSON、T014 的独立
  //   审查报告）不在本次发布包内，但不使已冻结的集合失实；警告会点名。
  //   打包步骤本身由扫描生成清单，生成时两者必然相等。
  const scanned = computeSourceSet(root);
  const scannedSet = new Set(scanned);
  const manifestSet = new Set(manifestFiles.map((f) => f.path));
  const missing = manifestFiles.map((f) => f.path).filter((p) => !scannedSet.has(p));
  const extra = scanned.filter((p) => !manifestSet.has(p));
  check(
    'manifest lists every worktree source file present at packaging',
    missing.length === 0,
    `${manifestFiles.length} listed, ${scanned.length} scanned` +
      (missing.length ? `; missing from worktree: ${missing.join(', ')}` : ''),
    failures,
  );
  if (extra.length > 0) {
    console.log(
      `[WARN] worktree has ${extra.length} source file(s) not in this frozen manifest (added after packaging; not part of this release): ${extra.join(', ')}`,
    );
  }
  let worktreeOk = 0;
  let worktreeSkippedVolatile = 0;
  const worktreeBad = [];
  for (const f of manifestFiles) {
    // 易变运行输出文件不参与工作树比对（见 VOLATILE_RUN_OUTPUTS）。
    if (VOLATILE_RUN_OUTPUTS.has(f.path)) {
      worktreeSkippedVolatile += 1;
      continue;
    }
    const abs = join(root, ...f.path.split('/'));
    if (!existsSync(abs)) {
      worktreeBad.push(`${f.path} (missing in worktree)`);
      continue;
    }
    const bytes = statSync(abs).size;
    const sha = sha256File(abs);
    if (bytes === f.bytes && sha === f.sha256) worktreeOk += 1;
    else worktreeBad.push(`${f.path} (bytes/sha mismatch)`);
  }
  check(
    'manifest file hashes match worktree',
    worktreeBad.length === 0,
    `${worktreeOk}/${manifestFiles.length - worktreeSkippedVolatile} OK` +
      (worktreeSkippedVolatile > 0
        ? `; ${worktreeSkippedVolatile} volatile run output(s) skipped (overwritten by every e2e run; still verified via manifest/ZIP/HEAD)`
        : '') +
      (worktreeBad.length ? `; bad: ${worktreeBad.slice(0, 5).join('; ')}` : ''),
    failures,
  );

  // ---- (a) 源码 ZIP：条目 == 清单，逐文件解包重算；HEAD 逐文件比对 ----
  const releaseDir = join(root, 'artifacts', 'release');
  const sourceZip = join(releaseDir, manifest.source_zip?.file ?? SOURCE_ZIP_NAME);
  const distZip = join(releaseDir, manifest.dist_zip?.file ?? DIST_ZIP_NAME);
  check('source zip exists', existsSync(sourceZip), sourceZip, failures);
  check('dist zip exists', existsSync(distZip), distZip, failures);
  if (existsSync(sourceZip) && manifest.source_zip) {
    const st = statSync(sourceZip);
    check(
      'source zip bytes+sha match manifest',
      st.size === manifest.source_zip.bytes && sha256File(sourceZip) === manifest.source_zip.sha256,
      `${st.size} bytes, sha256 ${sha256File(sourceZip).slice(0, 16)}…`,
      failures,
    );
    const entries = listZipEntries(sourceZip);
    const listed = manifestFiles.map((f) => f.path).sort();
    check(
      'source zip entries == manifest files',
      JSON.stringify(entries) === JSON.stringify(listed),
      `${entries.length} entries` +
        (JSON.stringify(entries) !== JSON.stringify(listed)
          ? `; diff: only-in-zip=${entries.filter((e) => !manifestSet.has(e)).join(',') || '—'} only-in-manifest=${listed.filter((e) => !entries.includes(e)).join(',') || '—'}`
          : ''),
      failures,
    );
    const tmpEx = join(tmpdir(), `tablefork-src-ex-${process.pid}-${Date.now()}`);
    extractZip(sourceZip, tmpEx);
    let zipOk = 0;
    const zipBad = [];
    for (const f of manifestFiles) {
      const ex = join(tmpEx, ...f.path.split('/'));
      if (!existsSync(ex)) {
        zipBad.push(`${f.path} (missing in zip)`);
        continue;
      }
      if (statSync(ex).size === f.bytes && sha256File(ex) === f.sha256) zipOk += 1;
      else zipBad.push(`${f.path} (content mismatch)`);
    }
    check(
      'source zip contents match manifest hashes',
      zipBad.length === 0,
      `${zipOk}/${manifestFiles.length} OK` +
        (zipBad.length ? `; bad: ${zipBad.slice(0, 5).join('; ')}` : ''),
      failures,
    );
  }

  // HEAD 逐文件比对（已在 HEAD 中的文件；新文件点名，不算失败）。
  // 语义：清单哈希必须 == 工作区（上一检查已证）。对 HEAD 中已有的文件，
  // 若 HEAD blob 与清单不同，必须是 T013 的合法修改/新文件——即
  // `git status` 显示该路径有改动；若 git status 干净却 blob 不同，
  // 说明清单与已提交内容不一致，是真失败。提交后重跑本脚本时工作区
  // 干净，全部文件都须与 HEAD blob 一致（严格模式自动生效）。
  const tracked = new Set(
    git('ls-tree -r --name-only HEAD', root)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  // 注意：这里不用 git() 助手——它会对整段输出 .trim()，会吃掉第一行
  // porcelain 的前导状态空格（` M <路径>` 变 `M <路径>`），使 slice(3)
  // 错位。直接取原始输出再逐行切列。
  const dirty = new Set(
    execSync('git status --porcelain', { cwd: root, encoding: 'utf8' })
      .split('\n')
      .map((s) => {
        // porcelain 原始格式：`XY<空格><路径>`（X/Y 各 1 列，含前导空格时
        // 如 ` M <路径>`）；必须先按列切（slice(3)），再 trim，绝不能
        // 先 trim——会吃掉状态列导致路径错位。
        if (s === '') return '';
        const p = s.slice(3).trim();
        const arrow = p.indexOf(' -> ');
        return arrow >= 0 ? p.slice(arrow + 4) : p;
      })
      .filter(Boolean),
  );
  let headOk = 0;
  let headModified = 0;
  let headNotYet = 0;
  const headBad = [];
  for (const f of manifestFiles) {
    if (!tracked.has(f.path)) {
      headNotYet += 1;
      continue;
    }
    const blob = execFileSync('git', ['show', `HEAD:${f.path}`], { cwd: root });
    const sha = createHash('sha256').update(blob).digest('hex');
    if (sha === f.sha256 && blob.length === f.bytes) {
      headOk += 1;
    } else if (dirty.has(f.path)) {
      headModified += 1;
    } else {
      headBad.push(f.path);
    }
  }
  check(
    'manifest file hashes match git HEAD blobs',
    headBad.length === 0,
    `${headOk} in HEAD OK, ${headModified} modified vs HEAD (T013 changes, worktree-verified), ${headNotYet} not in HEAD yet (worktree-only, pre-commit)` +
      (headBad.length ? `; bad: ${headBad.join(', ')}` : ''),
    failures,
  );

  // 全部文件都已在 HEAD 时：git archive 新鲜归档，逐文件比对内容。
  if (headNotYet === 0 && headBad.length === 0) {
    const tmpArc = join(tmpdir(), `tablefork-arc-${process.pid}-${Date.now()}`);
    mkdirSync(tmpArc, { recursive: true });
    const arcZip = join(tmpArc, 'archive.zip');
    const pathspec = manifestFiles.map((f) => f.path);
    execFileSync(
      'git',
      ['archive', 'HEAD', '-o', arcZip, '--', ...pathspec],
      { cwd: root, stdio: 'pipe' },
    );
    const arcEntries = listZipEntries(arcZip).filter((e) => !e.endsWith('/'));
    // 注：git archive 会额外写 20 个目录条目（`artifacts/`、`src/core/` 等），
    // 确定性 ZIP 只含文件条目；比对时忽略目录条目，只比文件集合与内容。
    const listed = manifestFiles.map((f) => f.path).sort();
    const tmpArcEx = join(tmpArc, 'ex');
    extractZip(arcZip, tmpArcEx);
    let arcOk = 0;
    const arcBad = [];
    for (const f of manifestFiles) {
      const ex = join(tmpArcEx, ...f.path.split('/'));
      if (existsSync(ex) && sha256File(ex) === f.sha256) arcOk += 1;
      else arcBad.push(f.path);
    }
    check(
      'fresh git archive HEAD matches source zip contents',
      JSON.stringify(arcEntries) === JSON.stringify(listed) && arcBad.length === 0,
      `${arcOk}/${manifestFiles.length} files content-identical` +
        (arcBad.length ? `; bad: ${arcBad.slice(0, 5).join(', ')}` : ''),
      failures,
    );
  } else {
    console.log('[SKIP] fresh git archive comparison — not all manifest files are in HEAD yet');
  }

  // ---- (b) dist ZIP 与一次全新构建一致 ----
  if (existsSync(distZip) && manifest.dist_zip) {
    const st = statSync(distZip);
    check(
      'dist zip bytes+sha match manifest',
      st.size === manifest.dist_zip.bytes && sha256File(distZip) === manifest.dist_zip.sha256,
      `${st.size} bytes, sha256 ${sha256File(distZip).slice(0, 16)}…`,
      failures,
    );
    console.log('rebuilding (npm run build) for dist comparison…');
    try {
      execSync('npm run build', { cwd: root, stdio: 'pipe' });
    } catch {
      check('fresh rebuild succeeds', false, 'npm run build exit != 0', failures);
      console.log(`RESULT: FAIL (${failures.length} failing checks)`);
      return 1;
    }
    // 直接扫 dist/ 子树（文件相对路径）：
    const distList = [];
    const walkDist = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, e.name);
        const rel = relative(join(root, 'dist'), abs).split(sep).join('/');
        if (e.isDirectory()) walkDist(abs);
        else if (e.isFile()) distList.push(rel);
      }
    };
    walkDist(join(root, 'dist'));
    distList.sort();
    const tmpRebuilt = join(tmpdir(), `tablefork-rebuilt-${process.pid}-${Date.now()}.zip`);
    const rebuilt = deterministicZip(join(root, 'dist'), distList, tmpRebuilt);
    check(
      'dist zip == fresh build (deterministic re-zip, byte-identical)',
      rebuilt.sha256 === manifest.dist_zip.sha256 && rebuilt.bytes === manifest.dist_zip.bytes,
      `fresh: ${rebuilt.bytes} bytes, sha256 ${rebuilt.sha256.slice(0, 16)}…`,
      failures,
    );
    const distEntries = listZipEntries(distZip).sort();
    check(
      'dist zip entries == fresh dist/ files',
      JSON.stringify(distEntries) === JSON.stringify(distList),
      `${distEntries.length} entries`,
      failures,
    );
  }

  // ---- (d) REVIEW_PACK 各卷哈希与发布包一致 ----
  const reviewDir = join(root, 'review');
  const packFiles = readdirSync(reviewDir)
    .filter((n) => /^REVIEW_PACK_\d+\.md$/.test(n))
    .sort();
  check('review packs exist', packFiles.length > 0, `${packFiles.length} packs`, failures);
  const manifestPacks = new Map((manifest.review_packs ?? []).map((p) => [p.file, p]));
  let packsOk = 0;
  const packBad = [];
  const seenCode = new Map();
  const manifestByPath = new Map(manifestFiles.map((f) => [f.path, f]));
  for (const pack of packFiles) {
    const abs = join(reviewDir, pack);
    const sha = sha256File(abs);
    const mp = manifestPacks.get(pack);
    if (!mp || mp.sha256 !== sha || mp.bytes !== statSync(abs).size) {
      packBad.push(`${pack} (hash mismatch vs manifest)`);
      continue;
    }
    packsOk += 1;
    // 解析卷内文件块：### <path> + SHA-256: 行 + ```` 围栏全文。
    const text = readFileSync(abs, 'utf8');
    const blockRe = /^### (.+)$\nSHA-256: ([0-9a-f]{64})\nBytes: (\d+)\nLines: (\d+)\n\n````[^\n]*\n([\s\S]*?)^````$/gm;
    let m;
    while ((m = blockRe.exec(text)) !== null) {
      const [, p, shaInPack, bytesInPack, linesInPack, content] = m;
      const mf = manifestByPath.get(p);
      const contentSha = sha256Text(content);
      // 围栏捕获的内容总以一个换行结束；源文件本身若无末尾换行
      // （如 package.json、tsconfig.json），捕获内容会多一个换行——
      // 两种候选都算，任一与清单一致即通过（块头 SHA-256 是权威值，
      // 生成时直接取自源文件，见打包步骤）。
      const contentOk =
        contentSha === (mf === undefined ? '' : mf.sha256) ||
        (content.endsWith('\n') &&
          sha256Text(content.slice(0, -1)) === (mf === undefined ? '' : mf.sha256));
      if (!mf) {
        packBad.push(`${pack}: block ${p} not in manifest`);
        continue;
      }
      if (shaInPack !== mf.sha256 || !contentOk) {
        packBad.push(`${pack}: block ${p} sha mismatch (header ${shaInPack.slice(0, 8)}…, content ${contentSha.slice(0, 8)}…, manifest ${mf.sha256.slice(0, 8)}…)`);
        continue;
      }
      if (Number(bytesInPack) !== mf.bytes) {
        packBad.push(`${pack}: block ${p} bytes mismatch`);
        continue;
      }
      if (seenCode.has(p)) {
        packBad.push(`${pack}: ${p} duplicated (also in ${seenCode.get(p)})`);
        continue;
      }
      seenCode.set(p, pack);
      void linesInPack;
    }
  }
  check(
    'review pack hashes match manifest',
    packBad.length === 0 && packsOk === packFiles.length,
    `${packsOk}/${packFiles.length} packs OK` +
      (packBad.length ? `; bad: ${packBad.slice(0, 5).join('; ')}` : ''),
    failures,
  );
  const codeFiles = manifestFiles.filter((f) => isCodeTextFile(f.path)).map((f) => f.path);
  const unpacked = codeFiles.filter((p) => !seenCode.has(p));
  check(
    'every code text file appears in exactly one pack',
    unpacked.length === 0,
    `${seenCode.size}/${codeFiles.length} code files packed` +
      (unpacked.length ? `; unpacked: ${unpacked.join(', ')}` : ''),
    failures,
  );
  // REVIEW_INDEX.md 分卷表与各卷实测一致。
  const indexPath = join(reviewDir, 'REVIEW_INDEX.md');
  if (existsSync(indexPath)) {
    const indexText = readFileSync(indexPath, 'utf8');
    let indexOk = true;
    const indexBad = [];
    for (const pack of packFiles) {
      const sha = sha256File(join(reviewDir, pack));
      const rowRe = new RegExp(`^\\| ${pack.replace('.', '\\.')} \\| \\d+ \\| \\d+ \\| ${sha} \\|$`, 'm');
      if (!rowRe.test(indexText)) {
        indexOk = false;
        indexBad.push(pack);
      }
    }
    check(
      'REVIEW_INDEX pack table matches pack hashes',
      indexOk,
      indexBad.length ? `mismatch: ${indexBad.join(', ')}` : `${packFiles.length} packs listed`,
      failures,
    );
  } else {
    check('REVIEW_INDEX exists', false, 'review/REVIEW_INDEX.md 缺失', failures);
  }

  console.log(`RESULT: ${failures.length === 0 ? 'PASS' : 'FAIL'} (${failures.length} failing checks)`);
  if (failures.length) console.log(`failing: ${failures.join('; ')}`);
  return failures.length === 0 ? 0 : 1;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  process.exitCode = runChecks();
}
