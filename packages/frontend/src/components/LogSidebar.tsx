import React, { useMemo } from 'react';
import type { GraphDocument } from '@fcw/graph-core';
import { traverseLog } from '../log-traversal';
import type { LogEntry } from '../log-traversal';

export interface LogSidebarProps {
  doc: GraphDocument;
  visible: boolean;
  activeNodeId?: string | null;
  onEntryClick: (nodeId: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  user_prompt: 'You',
  response: 'Assistant',
  code: 'Code',
  tool_call: 'Tool',
  tool_result: 'Result',
  thought: 'Thought',
  summary: 'Summary',
  annotation: 'Note',
};

const TYPE_COLORS: Record<string, string> = {
  user_prompt: '#3B82F6',
  response: '#10B981',
  code: '#F59E0B',
  tool_call: '#F97316',
  tool_result: '#EAB308',
  thought: '#8B5CF6',
  summary: '#6366F1',
  annotation: '#94A3B8',
};

export function LogSidebar({ doc, visible, activeNodeId, onEntryClick }: LogSidebarProps) {
  const entries = useMemo(() => traverseLog(doc), [doc, doc.nodes, doc.edges]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 340,
        height: '100vh',
        background: '#0F172A',
        borderLeft: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1001,
      }}
      data-testid="log-sidebar"
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #334155' }}>
        <span style={{ color: '#E2E8F0', fontWeight: 600, fontSize: 14 }}>Conversation Log</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {entries.length === 0 && (
          <div style={{ color: '#64748B', padding: 16, fontSize: 13, textAlign: 'center' }}>
            No messages yet
          </div>
        )}
        {entries.map((entry) => (
          <LogEntryRow
            key={entry.id}
            entry={entry}
            isActive={entry.id === activeNodeId}
            onClick={() => onEntryClick(entry.id)}
          />
        ))}
      </div>
    </div>
  );
}

function LogEntryRow({ entry, isActive, onClick }: { entry: LogEntry; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: isActive ? '#1E293B' : 'none',
        border: 'none',
        borderLeft: `3px solid ${isActive ? (TYPE_COLORS[entry.type] ?? '#334155') : 'transparent'}`,
        padding: '8px 16px',
        paddingLeft: `${16 + entry.depth * 16}px`,
        cursor: 'pointer',
        color: '#E2E8F0',
      }}
      data-testid="log-entry"
    >
      <div style={{ fontSize: 11, color: TYPE_COLORS[entry.type] ?? '#94A3B8', fontWeight: 600, marginBottom: 2 }}>
        {TYPE_LABELS[entry.type] ?? entry.type}
      </div>
      <div style={{
        fontSize: 13,
        lineHeight: 1.4,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        color: '#CBD5E1',
      }}>
        {entry.content || '(empty)'}
      </div>
    </button>
  );
}
