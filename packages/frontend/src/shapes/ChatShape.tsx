import React from 'react';
import {
  BaseBoxShapeUtil,
  TLBaseShape,
  HTMLContainer,
  RecordProps,
  T,
  stopEventPropagation,
} from 'tldraw';
import { ChatWindow } from '../components/ChatWindow';
import type { ChatView, Capabilities, PendingPermission } from '../chat-store';
import type { ChatSettings, Attachment, TokenUsage } from '@fcw/graph-core';
import type { DirListing } from '../components/FolderPicker';
import { collapseToggle } from '../collapse-pill';

// Chat data rides in shape props (JSON), following the v1 GraphNodeShape pattern:
// the server is the source of truth and sync code updates props on every event.
export type ChatShapeProps = {
  w: number;
  h: number;
  chatId: string;
  title: string;
  messagesJson: string;
  streamingText: string; // '' means "not streaming"; '\0' sentinel unused — see hasStream
  hasStream: boolean;
  error: string;
  collapsed: boolean;
  expandedH: number; // height to restore when un-collapsing
  settingsJson: string;
  pendingPermissionJson: string; // '' means no pending permission
  capabilitiesJson: string; // '' means capabilities not loaded yet
  usageJson: string; // '' means no usage recorded yet
  contextChats: number;
};

export type ChatShape = TLBaseShape<'chat-node', ChatShapeProps>;

export interface ChatActions {
  sendPrompt: (chatId: string, content: string, attachmentIds?: string[]) => void;
  requestBranch: (chatId: string, position: { x: number; y: number }) => void;
  stopStream: (chatId: string) => void;
  regenerate: (chatId: string) => void;
  updateSettings: (chatId: string, patch: Partial<ChatSettings>) => void;
  permissionDecision: (chatId: string, requestId: string, behavior: 'allow' | 'deny') => void;
  uploadAttachment: (file: File) => Promise<Attachment>;
  /** Browse local server directories for the cwd picker. */
  listDirs: (path?: string) => Promise<DirListing>;
  compact: (chatIds: string[]) => void;
  regenerateCompaction: (compactionId: string) => void;
  updateCompactionDocument: (compactionId: string, document: string) => void;
  /** Navigate into the tldraw page holding the compaction's member chats. */
  enterCompaction: (compactionId: string) => void;
}

let registeredActions: ChatActions | null = null;

/** The canvas app registers how shapes talk to the server. */
export function registerChatActions(actions: ChatActions | null): void {
  registeredActions = actions;
}

/** Accessor for shapes that live outside the React tree (e.g. CompactShape). */
export function chatActions(): ChatActions | null {
  return registeredActions;
}

function parseJson<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function viewFromShape(shape: ChatShape): ChatView {
  return {
    id: shape.props.chatId,
    title: shape.props.title,
    position: { x: shape.x, y: shape.y },
    messages: parseJson<ChatView['messages']>(shape.props.messagesJson, []),
    streamingText: shape.props.hasStream ? shape.props.streamingText : null,
    error: shape.props.error || null,
    settings: parseJson<ChatSettings>(shape.props.settingsJson, { engine: 'api' }),
    pendingPermission: parseJson<PendingPermission | null>(shape.props.pendingPermissionJson, null),
    // The shape only carries the head prompt (what the banner shows); the full
    // queue is authoritative in the store, not this render projection.
    pendingPermissionQueue: [],
    usage: parseJson<TokenUsage | null>(shape.props.usageJson, null),
    contextChats: shape.props.contextChats,
  };
}

export function capabilitiesFromShape(shape: ChatShape): Capabilities | undefined {
  return shape.props.capabilitiesJson
    ? parseJson<Capabilities | undefined>(shape.props.capabilitiesJson, undefined)
    : undefined;
}

export class ChatShapeUtil extends BaseBoxShapeUtil<ChatShape> {
  static override type = 'chat-node' as const;

  static override props: RecordProps<ChatShape> = {
    w: T.number,
    h: T.number,
    chatId: T.string,
    title: T.string,
    messagesJson: T.string,
    streamingText: T.string,
    hasStream: T.boolean,
    error: T.string,
    collapsed: T.boolean,
    expandedH: T.number,
    settingsJson: T.string,
    pendingPermissionJson: T.string,
    capabilitiesJson: T.string,
    usageJson: T.string,
    contextChats: T.number,
  };

  override getDefaultProps(): ChatShapeProps {
    return {
      w: 360,
      h: 420,
      chatId: '',
      title: '',
      messagesJson: '[]',
      streamingText: '',
      hasStream: false,
      error: '',
      collapsed: false,
      expandedH: 420,
      settingsJson: '{"engine":"api"}',
      pendingPermissionJson: '',
      capabilitiesJson: '',
      usageJson: '',
      contextChats: 0,
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

  override component(shape: ChatShape) {
    const view = viewFromShape(shape);
    const isEditing = this.editor.getEditingShapeId() === shape.id;
    const collapsed = shape.props.collapsed;

    const toggleCollapse = () => {
      const next = collapseToggle({
        collapsed: shape.props.collapsed,
        h: shape.props.h,
        expandedH: shape.props.expandedH,
      });
      this.editor.updateShape<ChatShape>({
        id: shape.id,
        type: 'chat-node',
        props: next,
      });
    };

    return (
      <HTMLContainer
        style={{
          width: '100%',
          height: '100%',
          border: '2px solid #3B82F6',
          borderRadius: 10,
          overflow: 'hidden',
          background: '#fff',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
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
        {collapsed ? (
          <div
            data-testid="chat-pill"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              height: '100%',
              padding: '0 78px 0 12px',
              boxSizing: 'border-box',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              color: '#334155',
            }}
          >
            <span
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: 1,
              }}
            >
              {view.title || 'New chat'}
            </span>
            <span
              style={{
                background: '#E2E8F0',
                color: '#475569',
                borderRadius: 10,
                padding: '1px 8px',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {view.messages.length}
            </span>
          </div>
        ) : (
          <ChatWindow
            chat={view}
            capabilities={capabilitiesFromShape(shape)}
            onSend={(content, attachmentIds) =>
              registeredActions?.sendPrompt(shape.props.chatId, content, attachmentIds)
            }
            onStop={() => registeredActions?.stopStream(shape.props.chatId)}
            onRegenerate={() => registeredActions?.regenerate(shape.props.chatId)}
            onUpdateSettings={(patch) => registeredActions?.updateSettings(shape.props.chatId, patch)}
            onPermissionDecision={(requestId, behavior) =>
              registeredActions?.permissionDecision(shape.props.chatId, requestId, behavior)
            }
            uploadAttachment={(file) =>
              registeredActions
                ? registeredActions.uploadAttachment(file)
                : Promise.reject(new Error('not connected'))
            }
            listDirs={(path) =>
              registeredActions
                ? registeredActions.listDirs(path)
                : Promise.reject(new Error('not connected'))
            }
          />
        )}
        {/* Collapse/expand toggle: same event pattern as + branch. */}
        <button
          title={collapsed ? 'Expand chat' : 'Collapse to pill'}
          onPointerDown={stopEventPropagation}
          onTouchStart={stopEventPropagation}
          onDoubleClick={stopEventPropagation}
          onPointerUp={(e) => {
            stopEventPropagation(e);
            toggleCollapse();
          }}
          style={{
            position: 'absolute',
            top: 4,
            right: 70,
            width: 22,
            height: 22,
            padding: 0,
            borderRadius: 11,
            border: 'none',
            background: '#E2E8F0',
            color: '#334155',
            fontSize: 12,
            fontWeight: 700,
            lineHeight: '22px',
            cursor: 'pointer',
            pointerEvents: 'all',
            boxShadow: '0 1px 3px rgba(15,23,42,0.2)',
            touchAction: 'none',
          }}
        >
          {collapsed ? '▢' : '—'}
        </button>
        {/* Branch handle: inside the card (overflow clips anything outside),
            always interactive even when the card isn't in edit mode. */}
        <button
          title="Branch: new chat inheriting this one's history"
          onPointerDown={stopEventPropagation}
          onTouchStart={stopEventPropagation}
          onDoubleClick={stopEventPropagation}
          onPointerUp={(e) => {
            stopEventPropagation(e);
            registeredActions?.requestBranch(shape.props.chatId, {
              x: shape.x,
              y: shape.y + shape.props.h + 110,
            });
          }}
          style={{
            position: 'absolute',
            top: 4,
            right: 6,
            height: 22,
            padding: '0 8px',
            borderRadius: 11,
            border: 'none',
            background: '#3B82F6',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            lineHeight: '22px',
            cursor: 'pointer',
            pointerEvents: 'all',
            boxShadow: '0 1px 3px rgba(15,23,42,0.25)',
            touchAction: 'none',
          }}
        >
          + branch
        </button>
      </HTMLContainer>
    );
  }

  override indicator(shape: ChatShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} />;
  }
}
