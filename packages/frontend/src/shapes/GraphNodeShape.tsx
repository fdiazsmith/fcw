import React from 'react';
import {
  BaseBoxShapeUtil,
  TLBaseShape,
  HTMLContainer,
  RecordProps,
  T,
} from 'tldraw';
import type { NodeType, NodeStatus } from '@fcw/graph-core';
import { getNodeColor } from '../colors';
import ReactMarkdown from 'react-markdown';

export type GraphNodeShapeProps = {
  nodeType: NodeType;
  content: string;
  status: NodeStatus;
  label: string;
};

export type GraphNodeShape = TLBaseShape<'graph-node', GraphNodeShapeProps>;

const LABEL_BG: Record<NodeType, string> = {
  user_prompt: '#3B82F6',
  response: '#22C55E',
  code: '#334155',
  tool_call: '#F97316',
  tool_result: '#EAB308',
  thought: '#6B7280',
  summary: '#A855F7',
  annotation: '#D97706',
};

const isMarkdown = (t: NodeType) => t === 'response' || t === 'thought' || t === 'summary' || t === 'annotation';
const isCode = (t: NodeType) => t === 'code';

export class GraphNodeShapeUtil extends BaseBoxShapeUtil<GraphNodeShape> {
  static override type = 'graph-node' as const;

  static override props: RecordProps<GraphNodeShape> = {
    w: T.number,
    h: T.number,
    nodeType: T.string as T.Validator<NodeType>,
    content: T.string,
    status: T.string as T.Validator<NodeStatus>,
    label: T.string,
  };

  override getDefaultProps(): GraphNodeShapeProps & { w: number; h: number } {
    return {
      w: 280,
      h: 200,
      nodeType: 'user_prompt',
      content: '',
      status: 'completed',
      label: '',
    };
  }

  override canEdit(): boolean {
    return true;
  }

  override canScroll(): boolean {
    return true;
  }

  override component(shape: GraphNodeShape) {
    const { nodeType, content, status, label } = shape.props;
    const borderColor = getNodeColor(nodeType);
    const streaming = status === 'streaming';

    const activateScrollableEditing = () => {
      if (this.editor.getEditingShapeId() !== shape.id) {
        this.editor.setEditingShape(shape.id);
      }
    };

    const stopWheelPropagation: React.WheelEventHandler<HTMLDivElement> = (e) => {
      e.stopPropagation();
    };

    return (
      <HTMLContainer
        style={{
          width: '100%',
          height: '100%',
          border: `2px solid ${borderColor}`,
          borderRadius: 8,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: isCode(nodeType) ? '#1E293B' : '#fff',
          animation: streaming ? 'pulse-border 1s infinite' : undefined,
        }}
      >
        <style>{`
          @keyframes pulse-border {
            0%, 100% { box-shadow: 0 0 0 0 ${borderColor}88; }
            50% { box-shadow: 0 0 0 4px ${borderColor}44; }
          }
        `}</style>
        <div
          style={{
            background: LABEL_BG[nodeType] ?? borderColor,
            color: nodeType === 'annotation' ? '#1E293B' : '#fff',
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}
        >
          {label || nodeType.replace('_', ' ')}
          {streaming && ' ●'}
        </div>
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            pointerEvents: 'all',
            padding: 8,
            maxHeight: 200 - 28,
            fontSize: 13,
            color: isCode(nodeType) ? '#E2E8F0' : '#1E293B',
            fontFamily: isCode(nodeType) ? 'monospace' : undefined,
            whiteSpace: isCode(nodeType) ? 'pre-wrap' : undefined,
          }}
          onPointerEnter={activateScrollableEditing}
          onPointerDown={activateScrollableEditing}
          onWheel={stopWheelPropagation}
        >
          {isMarkdown(nodeType) ? (
            <ReactMarkdown>{content}</ReactMarkdown>
          ) : (
            <span>{content}</span>
          )}
        </div>
      </HTMLContainer>
    );
  }

  override indicator(shape: GraphNodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />;
  }
}
