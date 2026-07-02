import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Tldraw, Editor, createShapeId, TLShapeId, TLArrowBinding, TLShape } from 'tldraw';
import 'tldraw/tldraw.css';
import { ChatShapeUtil, ChatShape, registerChatActions } from './shapes/ChatShape';
import { createWsClient, WsClient } from './ws-client';
import { emptyChatState, applyChatMessage, ChatState, ChatView } from './chat-store';
import type { ChatServerMessage, ChatClientMessage } from '@fcw/graph-core';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8009';

const customShapes = [ChatShapeUtil];

function chatShapeId(chatId: string): TLShapeId {
  return createShapeId(`chat-${chatId}`);
}

function ctxArrowId(from: string, to: string): TLShapeId {
  return createShapeId(`ctx-${from}-${to}`);
}

/** Find any arrow representing the context edge from->to (created by us or adopted). */
function findCtxArrow(editor: Editor, from: string, to: string): TLShape | undefined {
  return editor
    .getCurrentPageShapes()
    .find(
      (s) =>
        s.type === 'arrow' &&
        s.meta?.fcwCtx === true &&
        s.meta?.from === from &&
        s.meta?.to === to,
    );
}

/** FCW v2 surface: chats are tldraw shapes, edges are context inheritance. */
export default function ChatCanvas() {
  const editorRef = useRef<Editor | null>(null);
  const stateRef = useRef<ChatState>(emptyChatState());
  const wsRef = useRef<WsClient | null>(null);
  // True while we mutate the canvas from server events, so side-effect
  // handlers don't echo those mutations back to the server.
  const syncingRef = useRef(false);

  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = useCallback((text: string) => {
    setBanner(text);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 5000);
  }, []);

  const send = useCallback((msg: ChatClientMessage) => {
    wsRef.current?.sendMessage(msg as never);
  }, []);

  const syncChat = useCallback((view: ChatView, focus = true) => {
    const editor = editorRef.current;
    if (!editor) return;
    const id = chatShapeId(view.id);
    const props = {
      chatId: view.id,
      title: view.title,
      messagesJson: JSON.stringify(view.messages),
      streamingText: view.streamingText ?? '',
      hasStream: view.streamingText !== null,
      error: view.error ?? '',
    };
    syncingRef.current = true;
    try {
      if (editor.getShape(id)) {
        editor.updateShape<ChatShape>({ id, type: 'chat-node', props });
      } else {
        editor.createShape<ChatShape>({
          id,
          type: 'chat-node',
          x: view.position.x,
          y: view.position.y,
          props,
        });
        if (focus) {
          editor.select(id);
          editor.setEditingShape(id);
        }
      }
    } finally {
      syncingRef.current = false;
    }
  }, []);

  const syncEdge = useCallback((msg: ChatServerMessage) => {
    const editor = editorRef.current;
    if (!editor) return;
    syncingRef.current = true;
    try {
      if (msg.type === 'chat_connected') {
        const { from, to } = msg.edge;
        // Already on canvas (e.g. an adopted hand-drawn arrow)? Done.
        if (findCtxArrow(editor, from, to)) return;
        const arrowId = ctxArrowId(from, to);
        if (editor.getShape(arrowId)) return;
        if (!editor.getShape(chatShapeId(from)) || !editor.getShape(chatShapeId(to))) return;
        editor.createShape({
          id: arrowId,
          type: 'arrow',
          meta: { fcwCtx: true, from, to },
          props: { dash: 'dashed', color: 'blue', size: 's' },
        });
        for (const [terminal, chatId] of [['start', from], ['end', to]] as const) {
          editor.createBinding({
            type: 'arrow',
            fromId: arrowId,
            toId: chatShapeId(chatId),
            props: {
              terminal,
              isExact: false,
              isPrecise: false,
              normalizedAnchor: { x: 0.5, y: 0.5 },
            },
          });
        }
      } else if (msg.type === 'chat_disconnected') {
        const arrow = findCtxArrow(editor, msg.from, msg.to);
        if (arrow) editor.deleteShape(arrow.id);
      }
    } finally {
      syncingRef.current = false;
    }
  }, []);

  /** Full canvas resync from a snapshot: create/update everything, delete strays. */
  const syncAll = useCallback((state: ChatState) => {
    const editor = editorRef.current;
    if (!editor) return;
    for (const view of Object.values(state.chats)) syncChat(view, false);
    for (const edge of state.edges) {
      syncEdge({ type: 'chat_connected', edge });
    }
    // remove shapes for chats/edges that no longer exist
    syncingRef.current = true;
    try {
      for (const shape of editor.getCurrentPageShapes()) {
        if (shape.type === 'chat-node') {
          const chatId = (shape as ChatShape).props.chatId;
          if (!state.chats[chatId]) editor.deleteShape(shape.id);
        } else if (shape.type === 'arrow' && shape.meta?.fcwCtx) {
          const { from, to } = shape.meta as { from: string; to: string };
          if (!state.edges.some((e) => e.from === from && e.to === to)) {
            editor.deleteShape(shape.id);
          }
        }
      }
    } finally {
      syncingRef.current = false;
    }
  }, [syncChat, syncEdge]);

  const handleServerMessage = useCallback(
    (msg: ChatServerMessage) => {
      if ((msg as { type: string }).type === 'error') {
        showBanner((msg as unknown as { message: string }).message);
        return;
      }
      if (msg.type === 'chat_snapshot') {
        const next = applyChatMessage(stateRef.current, msg);
        stateRef.current = next;
        syncAll(next);
        return;
      }
      const next = applyChatMessage(stateRef.current, msg);
      if (next === stateRef.current) return;
      stateRef.current = next;
      if (msg.type === 'chat_connected' || msg.type === 'chat_disconnected') {
        syncEdge(msg);
        return;
      }
      const chatId = msg.type === 'chat_created' ? msg.chat.id : msg.chatId;
      const view = next.chats[chatId];
      if (view) syncChat(view);
    },
    [syncChat, syncEdge, syncAll, showBanner],
  );

  useEffect(() => {
    const ws = createWsClient(WS_URL);
    wsRef.current = ws;
    ws.onMessage((msg) => handleServerMessage(msg as unknown as ChatServerMessage));
    registerChatActions({
      sendPrompt: (chatId, content) =>
        send({ type: 'chat_prompt_submitted', chatId, content }),
      requestBranch: (parentId, position) =>
        send({ type: 'chat_branch_requested', parentId, position }),
    });
    return () => {
      registerChatActions(null);
      ws.close();
      wsRef.current = null;
    };
  }, [handleServerMessage, send]);

  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // The snapshot may have arrived before the editor mounted — replay it.
      if (Object.keys(stateRef.current.chats).length > 0) {
        syncAll(stateRef.current);
      }

      // Persist card positions after drags (debounced per chat).
      const moveTimers = new Map<string, ReturnType<typeof setTimeout>>();
      editor.sideEffects.registerAfterChangeHandler('shape', (_prev, next) => {
        if (syncingRef.current || next.type !== 'chat-node') return;
        const chatId = (next as ChatShape).props.chatId;
        if (!chatId) return;
        const existing = moveTimers.get(chatId);
        if (existing) clearTimeout(existing);
        moveTimers.set(
          chatId,
          setTimeout(() => {
            moveTimers.delete(chatId);
            const shape = editor.getShape(next.id) as ChatShape | undefined;
            if (!shape) return;
            send({
              type: 'chat_move_requested',
              chatId,
              position: { x: shape.x, y: shape.y },
            });
          }, 500),
        );
      });

      // Double-click on empty canvas -> new chat shape at that point.
      const container = editor.getContainer();
      const onDblClick = (e: MouseEvent) => {
        const point = editor.screenToPage({ x: e.clientX, y: e.clientY });
        const hit = editor.getShapeAtPoint(point, { hitInside: true });
        if (hit) return;
        const editing = editor.getEditingShape();
        if (editing && editing.type === 'text') {
          editor.deleteShape(editing.id);
        }
        send({
          type: 'chat_create_requested',
          position: { x: point.x - 180, y: point.y - 60 },
        });
      };
      container.addEventListener('dblclick', onDblClick);

      // Hand-drawn arrow between two chat cards -> context edge.
      // Wait for the drag to finish, verify both terminals, then convert.
      editor.sideEffects.registerAfterCreateHandler('binding', (binding) => {
        if (syncingRef.current || binding.type !== 'arrow') return;
        const arrowId = binding.fromId;
        const arrow = editor.getShape(arrowId);
        if (!arrow || arrow.type !== 'arrow' || arrow.meta?.fcwCtx) return;

        const tryConvert = () => {
          if (editor.inputs.isDragging) {
            setTimeout(tryConvert, 150);
            return;
          }
          const a = editor.getShape(arrowId);
          if (!a) return; // already converted or deleted
          if (a.meta?.fcwCtx) return; // already adopted (handler fires once per terminal)
          const bindings = editor
            .getBindingsFromShape(a.id, 'arrow') as TLArrowBinding[];
          const start = bindings.find((b) => b.props.terminal === 'start');
          const end = bindings.find((b) => b.props.terminal === 'end');
          if (!start || !end) return;
          const fromShape = editor.getShape(start.toId);
          const toShape = editor.getShape(end.toId);
          if (fromShape?.type !== 'chat-node' || toShape?.type !== 'chat-node') return;
          const from = (fromShape as ChatShape).props.chatId;
          const to = (toShape as ChatShape).props.chatId;
          if (!from || !to || from === to) return;
          const existing = findCtxArrow(editor, from, to);
          if (existing && existing.id !== a.id) {
            // duplicate of an existing edge — drop the extra arrow only
            syncingRef.current = true;
            editor.deleteShape(a.id);
            syncingRef.current = false;
            return;
          }

          // Adopt the user's arrow in place: it stays exactly where they drew it,
          // restyled as a context edge. The server event is a no-op thanks to meta.
          syncingRef.current = true;
          editor.updateShape({
            id: a.id,
            type: 'arrow',
            meta: { fcwCtx: true, from, to },
            props: { dash: 'dashed', color: 'blue' },
          });
          syncingRef.current = false;
          send({ type: 'chat_connect_requested', from, to });
        };
        setTimeout(tryConvert, 150);
      });

      // Deleting a context arrow -> disconnect (unless we deleted it ourselves).
      editor.sideEffects.registerAfterDeleteHandler('shape', (shape) => {
        if (syncingRef.current) return;
        if (shape.type === 'arrow' && shape.meta?.fcwCtx) {
          send({
            type: 'chat_disconnect_requested',
            from: String(shape.meta.from),
            to: String(shape.meta.to),
          });
        }
      });

      return () => container.removeEventListener('dblclick', onDblClick);
    },
    [send, syncAll],
  );

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw shapeUtils={customShapes} onMount={onMount} />
      {banner && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1001,
            background: '#FEF2F2',
            color: '#B91C1C',
            border: '1px solid #FECACA',
            borderRadius: 8,
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 2px 8px rgba(15,23,42,0.12)',
            maxWidth: '60%',
          }}
        >
          {banner}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 1000,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: '#64748B',
            background: '#fff',
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid #E2E8F0',
          }}
        >
          double-click: new chat · + under a card: branch · draw arrow: connect context
        </span>
        <button
          onClick={() => {
            const editor = editorRef.current;
            const center = editor ? editor.getViewportPageBounds().center : { x: 0, y: 0 };
            send({
              type: 'chat_create_requested',
              position: { x: center.x - 180, y: center.y - 210 },
            });
          }}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #CBD5E1',
            background: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(15,23,42,0.1)',
          }}
        >
          + New chat
        </button>
      </div>
    </div>
  );
}
