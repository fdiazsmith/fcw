import React from 'react';

export interface MultiNodeActionsProps {
  nodeIds: string[];
  position: { x: number; y: number };
  onSummarize: () => void;
  onCollapseAll: () => void;
}

export function MultiNodeActions({
  nodeIds,
  position,
  onSummarize,
  onCollapseAll,
}: MultiNodeActionsProps) {
  const btnStyle: React.CSSProperties = {
    background: '#334155',
    color: '#E2E8F0',
    border: 'none',
    borderRadius: 4,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: 998,
        display: 'flex',
        gap: 4,
        background: '#1E293B',
        borderRadius: 8,
        padding: 4,
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}
      data-testid="multi-node-actions"
    >
      <span style={{ color: '#94A3B8', fontSize: 11, padding: '4px 6px' }}>
        {nodeIds.length} nodes
      </span>
      <button onClick={onSummarize} style={{ ...btnStyle, background: '#7C3AED' }}>
        Summarize
      </button>
      <button onClick={onCollapseAll} style={btnStyle}>
        Collapse All
      </button>
    </div>
  );
}
