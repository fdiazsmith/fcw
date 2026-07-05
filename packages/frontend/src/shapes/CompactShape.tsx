import React from 'react';
import { BaseBoxShapeUtil, TLBaseShape, HTMLContainer, RecordProps, T } from 'tldraw';
import { CompactCard } from '../components/CompactCard';
import { chatActions } from './ChatShape';

// Same pattern as ChatShape: the server is the source of truth; canvas sync
// rewrites props on every event, the card renders them.
export type CompactShapeProps = {
  w: number;
  h: number;
  compactionId: string;
  title: string;
  document: string; // markdown
  memberCount: number;
  stale: boolean;
  generating: boolean;
};

export type CompactShape = TLBaseShape<'compact-node', CompactShapeProps>;

export class CompactShapeUtil extends BaseBoxShapeUtil<CompactShape> {
  static override type = 'compact-node' as const;

  static override props: RecordProps<CompactShape> = {
    w: T.number,
    h: T.number,
    compactionId: T.string,
    title: T.string,
    document: T.string,
    memberCount: T.number,
    stale: T.boolean,
    generating: T.boolean,
  };

  override getDefaultProps(): CompactShapeProps {
    return {
      w: 420,
      h: 360,
      compactionId: '',
      title: '',
      document: '',
      memberCount: 0,
      stale: false,
      generating: false,
    };
  }

  override canEdit(): boolean {
    return true;
  }

  override canScroll(): boolean {
    return true;
  }

  override canResize(): boolean {
    return true;
  }

  override component(shape: CompactShape) {
    const isEditing = this.editor.getEditingShapeId() === shape.id;
    const id = shape.props.compactionId;

    return (
      <HTMLContainer
        style={{
          width: '100%',
          height: '100%',
          border: '2px solid #7C3AED',
          borderRadius: 10,
          overflow: 'hidden',
          background: '#FAF5FF',
          boxShadow: '0 2px 8px rgba(88, 28, 135, 0.12)',
          // While not editing, let tldraw handle drag/select on the whole card.
          pointerEvents: isEditing ? 'all' : 'none',
        }}
        onPointerDown={(e) => {
          if (isEditing) e.stopPropagation();
        }}
        onWheel={(e) => {
          if (isEditing) e.stopPropagation();
        }}
        onDoubleClick={() => {
          if (!isEditing) this.editor.setEditingShape(shape.id);
        }}
      >
        <CompactCard
          title={shape.props.title}
          document={shape.props.document}
          memberCount={shape.props.memberCount}
          stale={shape.props.stale}
          generating={shape.props.generating}
          editable={isEditing}
          onEnter={() => chatActions()?.enterCompaction(id)}
          onRegenerate={() => chatActions()?.regenerateCompaction(id)}
          onDocumentChange={(markdown) => chatActions()?.updateCompactionDocument(id, markdown)}
        />
      </HTMLContainer>
    );
  }

  override indicator(shape: CompactShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} />;
  }
}
