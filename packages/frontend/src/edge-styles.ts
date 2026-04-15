import type { EdgeType } from '@fcw/graph-core';

export interface EdgeStyle {
  dash: 'solid' | 'dashed' | 'dotted';
}

const EDGE_STYLES: Partial<Record<EdgeType, EdgeStyle>> = {
  reply_to: { dash: 'solid' },
  branches_from: { dash: 'dashed' },
  references: { dash: 'dotted' },
};

export function getEdgeStyle(type: EdgeType): EdgeStyle {
  return EDGE_STYLES[type] ?? { dash: 'solid' };
}
