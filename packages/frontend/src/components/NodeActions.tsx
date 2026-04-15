import React, { useCallback } from 'react';

export interface NodeActionsProps {
  content: string;
  nodeId: string;
  position: { x: number; y: number };
  onBranch: () => void;
  onCollapse: () => void;
  isCollapsed: boolean;
}

export function NodeActions({
  content,
  nodeId,
  position,
  onBranch,
  onCollapse,
  isCollapsed,
}: NodeActionsProps) {
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }, [content]);

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
      data-testid="node-actions"
    >
      <button onClick={onBranch} style={btnStyle}>
        Branch
      </button>
      <button onClick={handleCopy} style={btnStyle}>
        Copy
      </button>
      <button onClick={onCollapse} style={btnStyle}>
        {isCollapsed ? 'Expand' : 'Collapse'}
      </button>
    </div>
  );
}
