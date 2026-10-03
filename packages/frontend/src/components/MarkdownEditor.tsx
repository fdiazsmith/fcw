import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';

const EDIT_DEBOUNCE_MS = 500;

export interface MarkdownEditorProps {
  markdown: string;
  /** False renders read-only rich text. */
  editable: boolean;
  /** Debounced user edits, as markdown. */
  onChange: (markdown: string) => void;
  /** Exposes the TipTap editor for programmatic control. */
  editorRef?: (editor: Editor | null) => void;
}

/** Rich-text markdown editor (TipTap). Extracted from the old CompactCard. */
export function MarkdownEditor({ markdown, editable, onChange, editorRef }: MarkdownEditorProps) {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor(
    {
      extensions: [StarterKit, Markdown],
      content: markdown,
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
    // would masquerade as a user edit and schedule a phantom send.
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  // Server broadcasts (regeneration, another client's edit) replace the
  // content — but never mid-typing, and never over a pending local edit.
  useEffect(() => {
    if (!editor || editor.isFocused || debounceTimer.current) return;
    if (editor.getMarkdown() === markdown) return;
    editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
  }, [editor, markdown]);

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    [],
  );

  return <EditorContent editor={editor} />;
}
