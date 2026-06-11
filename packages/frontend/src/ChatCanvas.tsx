import React, { useCallback, useEffect, useRef } from 'react';
import { Tldraw, Editor, createShapeId, TLShapeId } from 'tldraw';
import 'tldraw/tldraw.css';
import { ChatShapeUtil, ChatShape, registerChatSender } from './shapes/ChatShape';
import { createWsClient, WsClient } from './ws-client';
import { emptyChatState, applyChatMessage, ChatState, ChatView } from './chat-store';
import type { ChatServerMessage, ChatClientMessage } from '@fcw/graph-core';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8009';

const customShapes = [ChatShapeUtil];

function chatShapeId(chatId: string): TLShapeId {
  return createShapeId(`chat-${chatId}`);
}

/** FCW v2 surface: chats are tldraw shapes, edges are context inheritance. */
export default function ChatCanvas() {
  const editorRef = useRef<Editor | null>(null);
  const stateRef = useRef<ChatState>(emptyChatState());
  const wsRef = useRef<WsClient | null>(null);

  const syncChat = useCallback((view: ChatView) => {
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
      editor.select(id);
      editor.setEditingShape(id);
    }
  }, []);

  const handleServerMessage = useCallback(
    (msg: ChatServerMessage) => {
      const next = applyChatMessage(stateRef.current, msg);
      if (next === stateRef.current) return;
      stateRef.current = next;
      const chatId = msg.type === 'chat_created' ? msg.chat.id : msg.chatId;
      const view = next.chats[chatId];
      if (view) syncChat(view);
    },
    [syncChat],
  );

  useEffect(() => {
    const ws = createWsClient(WS_URL);
    wsRef.current = ws;
    ws.onMessage((msg) => handleServerMessage(msg as unknown as ChatServerMessage));
    registerChatSender((chatId, content) => {
      const out: ChatClientMessage = { type: 'chat_prompt_submitted', chatId, content };
      ws.sendMessage(out as never);
    });
    return () => {
      registerChatSender(null);
      ws.close();
      wsRef.current = null;
    };
  }, [handleServerMessage]);

  const requestChatAt = useCallback((pageX: number, pageY: number) => {
    const out: ChatClientMessage = {
      type: 'chat_create_requested',
      position: { x: pageX, y: pageY },
    };
    wsRef.current?.sendMessage(out as never);
  }, []);

  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Double-click on empty canvas -> new chat shape at that point.
      const container = editor.getContainer();
      const onDblClick = (e: MouseEvent) => {
        const point = editor.screenToPage({ x: e.clientX, y: e.clientY });
        const hit = editor.getShapeAtPoint(point, { hitInside: true });
        if (hit) return;
        // tldraw's select tool may have just created an empty text shape; remove it.
        const editing = editor.getEditingShape();
        if (editing && editing.type === 'text') {
          editor.deleteShape(editing.id);
        }
        requestChatAt(point.x - 180, point.y - 60);
      };
      container.addEventListener('dblclick', onDblClick);

      return () => container.removeEventListener('dblclick', onDblClick);
    },
    [requestChatAt],
  );

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw shapeUtils={customShapes} onMount={onMount} />
      <button
        onClick={() => {
          const editor = editorRef.current;
          const center = editor ? editor.getViewportPageBounds().center : { x: 0, y: 0 };
          requestChatAt(center.x - 180, center.y - 210);
        }}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 1000,
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
  );
}
