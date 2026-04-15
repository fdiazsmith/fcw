import type { NodeType } from '@fcw/graph-core';

const NODE_COLORS: Record<NodeType, string> = {
  user_prompt: '#3B82F6',
  response: '#22C55E',
  code: '#1E293B',
  tool_call: '#F97316',
  tool_result: '#EAB308',
  thought: '#6B7280',
  summary: '#A855F7',
  annotation: '#FEF9C3',
};

export function getNodeColor(type: NodeType): string {
  return NODE_COLORS[type];
}
