import React, { useMemo, useState } from 'react';
import { DEFAULT_DOC_CONTEXT_BUDGET } from '@fcw/graph-core';
import type { DocWorkspace } from '@fcw/graph-core';
import { docContextSummary } from '../doc-context-view';

export interface DocContextInspectorProps {
  state: DocWorkspace;
  docId: string;
  /** Initial slider value. Inspection only — never changes the server's budget. */
  budget?: number;
}

/** 12300 -> '12.3k', 950 -> '950'. */
function fmtChars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n);
}

/** What a doc chat would receive as context: references, sizes, and what the budget degrades. */
export function DocContextInspector({
  state,
  docId,
  budget: initialBudget = DEFAULT_DOC_CONTEXT_BUDGET,
}: DocContextInspectorProps) {
  const [budget, setBudget] = useState(initialBudget);
  const summary = useMemo(() => docContextSummary(state, docId, budget), [state, docId, budget]);

  return (
    <div data-testid="doc-context-inspector" style={{ fontSize: 12, color: '#334155' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span>
          {fmtChars(summary.usedChars)} / {fmtChars(summary.budget)} chars · {summary.degradedCount} degraded
        </span>
        <input
          type="range"
          aria-label="Context budget"
          min={0}
          max={Math.max(initialBudget, DEFAULT_DOC_CONTEXT_BUDGET)}
          step={100}
          value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
          style={{ width: 90 }}
        />
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {summary.blocks.map((b) => (
          <li
            key={b.docId}
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              opacity: b.degraded ? 0.6 : 1,
              fontWeight: b.docId === docId ? 700 : 400,
            }}
          >
            <span>{b.title}</span>
            {b.degraded && (
              <span style={{ fontSize: 10, border: '1px dashed #94A3B8', borderRadius: 8, padding: '0 5px' }}>
                title only
              </span>
            )}
            <span style={{ marginLeft: 'auto', color: '#64748B' }}>{b.chars} chars</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
