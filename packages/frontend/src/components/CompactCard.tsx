import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';

const EDIT_DEBOUNCE_MS = 500;

export interface CompactCardProps {
  title: string;
  /** The compacted document, as markdown. */
  document: string;
  memberCount: number;
  /** Member transcripts changed since the document was generated. */
  stale: boolean;
  generating: boolean;
  /** True while the shape is in tldraw edit mode — the document accepts typing. */
  editable: boolean;
  onEnter: () => void;
  onRegenerate: () => void;
  onDocumentChange: (markdown: string) => void;
  /** Exposes the TipTap editor for programmatic control. */
  editorRef?: (editor: Editor | null) => void;
}

export function CompactCard({
  title,
  document,
  memberCount,
  stale,
  generating,
  editable,
  onEnter,
  onRegenerate,
  onDocumentChange,
  editorRef,
}: CompactCardProps) {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onDocumentChange);
  onChangeRef.current = onDocumentChange;

  const editor = useEditor(
    {
      extensions: [StarterKit, Markdown],
      content: document,
      contentType: 'markdown',
      editable,
      onUpdate({ editor }) {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          debounceTimer.current = null;
          onChangeRef.current(editor.getMarkdown());
        }, EDIT_DEBOUNCE_MS);
      },
    },
    [],
  );

  useEffect(() => {
    editorRef?.(editor);
    return () => editorRef?.(null);
  }, [editor, editorRef]);

  useEffect(() => {
    // Second arg false: setEditable emits a doc 'update' by default, which
    // would masquerade as a user edit and schedule a phantom document send.
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  // Server broadcasts (regeneration, another client's edit) replace the
  // content — but never mid-typing, and never over a pending local edit.
  useEffect(() => {
    if (!editor || editor.isFocused || debounceTimer.current) return;
    if (editor.getMarkdown() === document) return;
    editor.commands.setContent(document, { contentType: 'markdown', emitUpdate: false });
  }, [editor, document]);

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    [],
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        fontFamily: 'system-ui, sans-serif',
        background: '#FAF5FF',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderBottom: '1px solid #E9D5FF',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#581C87',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
          }}
        >
          {title || 'Compacted'}
        </span>
        <span
          style={{
            background: '#E9D5FF',
            color: '#6B21A8',
            borderRadius: 10,
            padding: '1px 8px',
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {memberCount} chats
        </span>
        <button
          title="Open compacted chats"
          onClick={onEnter}
          style={{
            border: 'none',
            background: '#7C3AED',
            color: '#fff',
            borderRadius: 10,
            height: 20,
            padding: '0 8px',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ⤢ open
        </button>
      </div>

      {generating && (
        <div
          style={{
            padding: '6px 10px',
            fontSize: 12,
            color: '#6B21A8',
            background: '#F3E8FF',
          }}
        >
          Generating document…
        </div>
      )}
      {!generating && stale && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            fontSize: 12,
            color: '#92400E',
            background: '#FEF3C7',
          }}
        >
          <span style={{ flex: 1 }}>Inner chats changed.</span>
          <button
            onClick={onRegenerate}
            style={{
              border: 'none',
              background: '#D97706',
              color: '#fff',
              borderRadius: 8,
              height: 20,
              padding: '0 8px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Regenerate document
          </button>
        </div>
      )}

      <div
        className="compact-doc"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 12px',
          fontSize: 13,
          color: '#1E293B',
          cursor: editable ? 'text' : 'default',
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
