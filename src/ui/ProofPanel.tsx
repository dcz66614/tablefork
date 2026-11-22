/**
 * P029 TableFork — 状态栏与证明面板（P029-T009）
 *
 * 项目书 §4.1/§4.2：状态栏把两件事分开显示——结构碰撞证明与 M 是否匹配
 * F(A)，绝不能混成“安全/危险”一个分数。CERTIFIED_COLLISION 展示 A≠B 与
 * F(A)=F(B) 两行独立断言；标题关联差异确实成立才另打
 * HEADER_ASSOCIATION_CHANGED，否则只说 STRUCTURAL_COLLISION。
 * MISMATCH 单独说明首个不同 UTF-8 字节附近的字符区间；此时证书只对 F(A)
 * 生效。UNSUPPORTED / INVALID_INPUT 明确“不可确认”，不回退为猜测。
 */

import type { FirstDiff } from '../core/compare';
import type { AnalyzeResult, CollisionKind } from '../core/index';

export interface ProofPanelProps {
  result: AnalyzeResult | null;
  /** 分析抛错时的错误（UNSUPPORTED / INVALID_INPUT 状态）。 */
  error: { code: string; message: string } | null;
  kind?: CollisionKind;
  reason?: string;
  /** EXACT_DIFF 时的首个不同字节定位（由 App 调 compareMarkdown 得到）。 */
  firstDiff?: FirstDiff;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}…`;
}

export function ProofPanel(props: ProofPanelProps): React.JSX.Element {
  const { result, error, kind, reason, firstDiff } = props;

  const witnessLine = (): React.JSX.Element => {
    if (error !== null) {
      const unsupported =
        error.code === 'UNSUPPORTED_NESTED_TABLE' ||
        error.code === 'UNSUPPORTED_HEADER_SEMANTICS';
      return (
        <span>
          <span className="tf-chip bad">{unsupported ? 'UNSUPPORTED' : 'INVALID_INPUT'}</span>
          不可确认（{error.code}）：{error.message} 不回退为猜测。
        </span>
      );
    }
    if (result === null) return <span>—</span>;
    if (result.witness === 'CERTIFIED_COLLISION' && result.proof !== undefined) {
      return (
        <span>
          <span className="tf-chip ok">CERTIFIED_COLLISION</span>
          结构碰撞已证实：{kind ?? 'STRUCTURAL_COLLISION'}。源格 {result.proof.sourceCellId}，
          拆分代价 {result.proof.splitCost}。
        </span>
      );
    }
    return (
      <span>
        <span className="tf-chip warn">NO_WITNESS_FOUND</span>
        未发现证明：只表示在限定构造器里没找到，不表示保真。
        {reason !== undefined ? `（${reason}）` : ''}
      </span>
    );
  };

  const compareLine = (): React.JSX.Element => {
    if (result === null) return <span>—</span>;
    if (result.compare === 'EXACT_MATCH') {
      return (
        <span>
          <span className="tf-chip ok">EXACT_MATCH</span>
          M 与 F(A) 逐字节相同。
        </span>
      );
    }
    if (result.compare === 'NOT_SUPPLIED') {
      return (
        <span>
          <span className="tf-chip warn">NOT_SUPPLIED</span>
          未输入 M；上方显示的是生成的 F(A) 预览。
        </span>
      );
    }
    return (
      <span>
        <span className="tf-chip bad">MISMATCH（EXACT_DIFF）</span>
        M 与 F(A) 不相等；碰撞证书只对 F(A) 生效，不伪称适用于 M。
      </span>
    );
  };

  return (
    <section className="tf-status" aria-label="状态栏">
      <h2>状态栏</h2>
      <dl>
        <dt>结构碰撞证明</dt>
        <dd>{witnessLine()}</dd>
        <dt>Markdown 对账</dt>
        <dd>{compareLine()}</dd>
      </dl>
      <p className="tf-hint">
        两项分别显示，不合并为“安全 / 危险”分数；本工具不输出安全评分。
      </p>

      {result !== null && result.proof !== undefined && (
        <div>
          <p className="tf-assert">断言 1：A ≠ B（canonical cell graph 不同）</p>
          <p className="tf-assert">
            A 图 SHA-256：{shortHash(result.proof.aGraphSha256)}
            <br />B 图 SHA-256：{shortHash(result.proof.bGraphSha256)}
          </p>
          <p className="tf-assert">断言 2：F(A) = F(B)（UTF-8 逐字节相同）</p>
          <p className="tf-assert">Markdown SHA-256：{shortHash(result.proof.markdownSha256)}</p>
          <svg
            width="360"
            height="90"
            viewBox="0 0 360 90"
            className="tf-proof-svg"
            role="img"
            aria-label="示意图：左表 A 与右表 B 的合并结构不同（A 不等于 B），但两者生成的 Markdown 完全相同（F(A) 等于 F(B)）。"
          >
            <title>
              A 与 B 结构不同但 Markdown 相同：左框 A 的合并格被拆开得到右框 B，中间箭头指向同一份 Markdown。
            </title>
            <rect x="8" y="10" width="90" height="40" fill="#fff3cd" stroke="#8a6d00" strokeWidth="2" />
            <text x="53" y="34" textAnchor="middle" fontSize="14">表 A</text>
            <rect x="262" y="10" width="90" height="40" fill="#d9ecff" stroke="#0b5cad" strokeWidth="2" />
            <text x="307" y="34" textAnchor="middle" fontSize="14">表 B</text>
            <line x1="98" y1="30" x2="262" y2="30" stroke="#1a1a1a" strokeWidth="2" markerEnd="url(#tf-arrow)" />
            <defs>
              <marker id="tf-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="#1a1a1a" />
              </marker>
            </defs>
            <text x="180" y="24" textAnchor="middle" fontSize="12">A ≠ B（结构不同）</text>
            <text x="180" y="72" textAnchor="middle" fontSize="12">F(A) = F(B)（同一份 Markdown）</text>
          </svg>
          <p className="tf-svg-note">
            上图说明：左表 A 的合并格在右表 B 中被拆开，两张表结构不同，但中间 Markdown
            完全相同——只看 Markdown 无法确定原表合并关系。
          </p>
        </div>
      )}

      {result !== null && result.compare === 'EXACT_DIFF' && firstDiff !== undefined && (
        <div>
          <h3>M 与 F(A) 的首个不同位置</h3>
          <p>
            首个不同 UTF-8 字节下标：{firstDiff.byteOffset}；
            M 侧字符下标 {firstDiff.suppliedCharIndex ?? '（串已结束）'}
            {firstDiff.suppliedCharAtDiff !== undefined ? `（字符“${firstDiff.suppliedCharAtDiff}”）` : ''}；
            F(A) 侧字符下标 {firstDiff.canonicalCharIndex ?? '（串已结束）'}
            {firstDiff.canonicalCharAtDiff !== undefined ? `（字符“${firstDiff.canonicalCharAtDiff}”）` : ''}。
          </p>
          <p className="tf-assert">M 侧上下文：{firstDiff.suppliedContext}</p>
          <p className="tf-assert">F(A) 侧上下文：{firstDiff.canonicalContext}</p>
          <p>此时生成的碰撞证书只对 F(A) 生效，不伪称适用于 M。</p>
        </div>
      )}

      {result !== null && result.warnings.length > 0 && (
        <div>
          <h3>提示</h3>
          <ul>
            {result.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
