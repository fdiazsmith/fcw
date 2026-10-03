import React from 'react';
import { BaseBoxShapeUtil, TLBaseShape, HTMLContainer, RecordProps, T } from 'tldraw';
import { DocCard } from '../components/DocCard';
import type { DocCardModel } from '../doc-view';

// The doc box: one shape type for every doc (see MERMAID-DOCS.md "Box = doc").
// Like ChatShape, props are rewritten by canvas sync; the card model travels
// as a JSON string so the schema stays flat.
export type DocShapeProps = {
  w: number;
  h: number;
  docId: string;
  modelJson: string; // JSON DocCardModel; '' means not loaded yet
};

export type DocShape = TLBaseShape<'doc-node', DocShapeProps>;

export interface DocActions {
  /** Navigate into the doc's child canvas. */
  openCanvas: (docId: string) => void;
  regenerate: (docId: string) => void;
  select: (docId: string) => void;
}

let registeredActions: DocActions | null = null;

/** The canvas app registers how doc shapes talk to the app. */
export function registerDocActions(actions: DocActions | null): void {
  registeredActions = actions;
}

/** Accessor for shapes that live outside the React tree. */
export function docActions(): DocActions | null {
  return registeredActions;
}

function parseModel(raw: string): DocCardModel | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DocCardModel;
  } catch {
    return null;
  }
}

export class DocShapeUtil extends BaseBoxShapeUtil<DocShape> {
  static override type = 'doc-node' as const;

  static override props: RecordProps<DocShape> = {
    w: T.number,
    h: T.number,
    docId: T.string,
    modelJson: T.string,
  };

  override getDefaultProps(): DocShapeProps {
    return { w: 260, h: 150, docId: '', modelJson: '' };
  }

  override canEdit(): boolean {
    return false;
  }

  override canResize(): boolean {
    return false;
  }

  override component(shape: DocShape) {
    const model = parseModel(shape.props.modelJson);
    const id = shape.props.docId;
    if (!model) return <HTMLContainer />;

    return (
      <HTMLContainer style={{ width: '100%', height: '100%', pointerEvents: 'all' }}>
        <DocCard
          {...model}
          onOpenCanvas={() => docActions()?.openCanvas(id)}
          onRegenerate={() => docActions()?.regenerate(id)}
          onSelect={() => docActions()?.select(id)}
        />
      </HTMLContainer>
    );
  }

  override indicator(shape: DocShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} />;
  }
}
