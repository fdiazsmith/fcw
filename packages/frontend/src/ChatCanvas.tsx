import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Tldraw,
  Editor,
  createShapeId,
  TLShapeId,
  TLPageId,
  TLArrowBinding,
  TLShape,
  PageRecordType,
  DefaultHelperButtons,
  DefaultContextMenu,
  DefaultContextMenuContent,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TLComponents,
  TLUiContextMenuProps,
  useEditor,
  useValue,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { ChatShapeUtil, ChatShape, registerChatActions } from './shapes/ChatShape';
import { DocShapeUtil, DocShape, registerDocActions } from './shapes/DocShape';
import { createWsClient, WsClient } from './ws-client';
import { emptyChatState, applyChatMessage, clearPendingLayout, chatIdsOn, archivedChats, ChatState, ChatView } from './chat-store';
import {
  canvasPageSlug,
  canvasIdForPageSlug,
  currentCanvas,
  pushCanvas,
  popTo,
  pathToRoot,
  breadcrumbItems,
  BreadcrumbItem,
  NavStack,
} from './canvas-nav';
import { projectCanvas } from './canvas-projection';
import { layoutDocNodes, centerLayoutAt } from './doc-layout';
import { ChatSearchBar } from './components/ChatSearchBar';
import { PromptBar, PromptMode } from './components/PromptBar';
import { exportCanvasMermaid } from './export-mermaid';
import { DocPanel, DOC_PANEL_WIDTH } from './components/DocPanel';
import { GlobalGraph } from './components/GlobalGraph';
import { globalGraph } from './global-graph';
import type { GlobalGraphData } from './global-graph';
import { deletionIntents, DeletedShape } from './deletion-intents';
import { exportBranchMarkdown } from './export-branch';
import { ProjectMenu } from './components/ProjectMenu';
import { ArchivedChats } from './components/ArchivedChats';
import { projectUrl, projectWsUrl, createdProjectId } from './projects';
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import type { ChatServerMessage, ChatClientMessage, Position, ProjectSummary } from '@fcw/graph-core';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8009';
const HTTP_URL = WS_URL.replace(/^ws/, 'http');

const customShapes = [ChatShapeUtil, DocShapeUtil];

const crumbButton: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#334155',
  fontSize: 13,
  cursor: 'pointer',
  padding: 0,
};

// Our chrome renders inside tldraw's own layout slots so its flexbox keeps
// everything apart. Slots are stable components reading this context.
interface ChromeSlots {
  left: React.ReactNode;
  top: React.ReactNode;
  right: React.ReactNode;
}
const ChromeContext = React.createContext<ChromeSlots>({ left: null, top: null, right: null });

// The chat card context menu acts on the selected chat cards.
interface ChatMenuActions {
  archive: (chatIds: string[]) => void;
  requestDelete: (chatIds: string[]) => void;
}
const ChatMenuContext = React.createContext<ChatMenuActions>({ archive: () => {}, requestDelete: () => {} });

function ChatContextMenu(props: TLUiContextMenuProps) {
  const editor = useEditor();
  const actions = React.useContext(ChatMenuContext);
  const chatIds = useValue(
    'selected chats',
    () =>
      editor
        .getSelectedShapes()
        .filter((s): s is ChatShape => s.type === 'chat-node')
        .map((s) => s.props.chatId)
        .filter(Boolean),
    [editor],
  );
  return (
    <DefaultContextMenu {...props}>
      {chatIds.length > 0 && (
        <TldrawUiMenuGroup id="fcw-chat">
          <TldrawUiMenuItem id="fcw-archive-chat" label="Archive chat" onSelect={() => actions.archive(chatIds)} />
          <TldrawUiMenuItem
            id="fcw-delete-chat"
            label="Delete chat permanently"
            onSelect={() => actions.requestDelete(chatIds)}
          />
        </TldrawUiMenuGroup>
      )}
      <DefaultContextMenuContent />
    </DefaultContextMenu>
  );
}

const slot: React.CSSProperties = { pointerEvents: 'all' };
const chromeComponents: TLComponents = {
  // Canvases are tldraw pages driven by the breadcrumb; a second page menu would desync it.
  PageMenu: null,
  HelperButtons: () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={{ ...slot, margin: '8px 0 0 8px' }}>{React.useContext(ChromeContext).left}</div>
      <DefaultHelperButtons />
    </div>
  ),
  TopPanel: () => (
    <div style={{ ...slot, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 8 }}>
      {React.useContext(ChromeContext).top}
    </div>
  ),
  SharePanel: () => <div style={{ ...slot, margin: '8px 8px 0 0' }}>{React.useContext(ChromeContext).right}</div>,
  ContextMenu: ChatContextMenu,
};

/** Canvas mutations that mirror the store stay out of the undo stack: undoing
 *  them would delete cards the user never touched (and archive their chats). */
const SERVER_DRIVEN = { history: 'ignore' } as const;

function chatShapeId(chatId: string): TLShapeId {
  return createShapeId(`chat-${chatId}`);
}

/** A doc can be placed on many canvases, so its shape id is per canvas. */
function docShapeId(canvasId: string, docId: string): TLShapeId {
  return createShapeId(`doc-${canvasId}-${docId}`);
}

function docEdgeArrowId(canvasId: string, from: string, to: string): TLShapeId {
  return createShapeId(`docedge-${canvasId}-${from}-${to}`);
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ctxArrowId(from: string, to: string): TLShapeId {
  return createShapeId(`ctx-${from}-${to}`);
}

/** Upload a file to the server and return its attachment metadata. */
async function uploadAttachment(file: File): Promise<import('@fcw/graph-core').Attachment> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const res = await fetch(`${HTTP_URL}/attachments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, mediaType: file.type || 'application/octet-stream', data }),
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return res.json();
}

/** Browse server-side directories for the cwd folder picker. */
async function listDirs(path?: string): Promise<import('./components/FolderPicker').DirListing> {
  const qs = path ? `?path=${encodeURIComponent(path)}` : '';
  const res = await fetch(`${HTTP_URL}/fs/dirs${qs}`);
  if (!res.ok) throw new Error(`listing failed: ${res.status}`);
  return res.json();
}

/** Find any arrow representing the context edge from->to (created by us or
 *  adopted), on whichever page it lives. */
function findCtxArrow(editor: Editor, from: string, to: string): TLShape | undefined {
  return allFcwShapes(editor).find(
    (s) => s.type === 'arrow' && s.meta?.fcwCtx === true && s.meta?.from === from && s.meta?.to === to,
  );
}

/** Every fcw shape across all pages (chat cards, doc boxes, their arrows).
 *  Anything else on the canvas is the user's and sync never touches it. */
function allFcwShapes(editor: Editor): TLShape[] {
  const shapes: TLShape[] = [];
  for (const page of editor.getPages()) {
    for (const shapeId of editor.getPageShapeIds(page.id)) {
      const s = editor.getShape(shapeId);
      if (!s) continue;
      if (
        s.type === 'chat-node' ||
        s.type === 'doc-node' ||
        (s.type === 'arrow' && (s.meta?.fcwCtx || s.meta?.fcwDocEdge))
      ) {
        shapes.push(s);
      }
    }
  }
  return shapes;
}

function chatProps(view: ChatView, state: ChatState) {
  const caps = state.capabilities;
  const hasCaps = caps.models.length > 0 || caps.commands.length > 0;
  return {
    chatId: view.id,
    title: view.title,
    messagesJson: JSON.stringify(view.messages),
    streamingText: view.streamingText ?? '',
    hasStream: view.streamingText !== null,
    error: view.error ?? '',
    settingsJson: JSON.stringify(view.settings),
    pendingPermissionJson: view.pendingPermission ? JSON.stringify(view.pendingPermission) : '',
    capabilitiesJson: hasCaps ? JSON.stringify(caps) : '',
    usageJson: view.usage ? JSON.stringify(view.usage) : '',
    contextChats: view.contextChats,
  };
}

function bindArrow(editor: Editor, arrowId: TLShapeId, from: TLShapeId, to: TLShapeId) {
  for (const [terminal, target] of [['start', from], ['end', to]] as const) {
    editor.createBinding({
      type: 'arrow',
      fromId: arrowId,
      toId: target,
      props: { terminal, isExact: false, isPrecise: false, normalizedAnchor: { x: 0.5, y: 0.5 } },
    });
  }
}

/** FCW surface: one tldraw page per canvas (root + one per doc). The store
 *  owns doc boxes, chat cards and their arrows; tldraw owns everything else. */
export default function ChatCanvas() {
  const editorRef = useRef<Editor | null>(null);
  const stateRef = useRef<ChatState>(emptyChatState());
  const wsRef = useRef<WsClient | null>(null);
  // True while we mutate the canvas from server events, so side-effect
  // handlers don't echo those mutations back to the server.
  const syncingRef = useRef(false);

  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The page the editor started on is the root canvas.
  const mainPageIdRef = useRef<TLPageId | null>(null);
  // How the user got to the current canvas; drives the breadcrumb.
  const navRef = useRef<NavStack>([ROOT_CANVAS_ID]);
  // Prompt-bar chats awaiting their chat_created, oldest first.
  const pendingPromptsRef = useRef<{ content: string; canvasId: string; position: Position }[]>([]);
  const [crumbs, setCrumbs] = useState<BreadcrumbItem[]>(breadcrumbItems(emptyChatState(), [ROOT_CANVAS_ID]));
  // The doc side panel: which doc, and a store snapshot that re-renders it
  // (refreshed on every server message only while the panel is open).
  const [panelDocId, setPanelDocId] = useState<string | null>(null);
  const panelDocIdRef = useRef<string | null>(null);
  const [panelState, setPanelState] = useState<ChatState>(emptyChatState());
  // The global graph modal: a snapshot query of the store, taken when opened.
  const [graph, setGraph] = useState<GlobalGraphData | null>(null);
  // M7.7: store snapshot for the project menu (open project, list, settings).
  const [menuState, setMenuState] = useState<ChatState>(emptyChatState());
  // A create request awaiting its project_list: the title and the list before it.
  const pendingCreateRef = useRef<{ title: string; before: ProjectSummary[] } | null>(null);
  // "Archived (n)": the archived chats' ids and titles, refreshed from the store.
  const [archived, setArchived] = useState<{ id: string; title: string }[]>([]);
  // Chats awaiting the "Delete permanently?" confirm from the context menu.
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);

  const openPanel = useCallback((docId: string | null) => {
    panelDocIdRef.current = docId;
    if (docId) setPanelState(stateRef.current);
    setPanelDocId(docId);
  }, []);

  // Export Mermaid: copy the current canvas; if the clipboard refuses, show the text.
  const [exportState, setExportState] = useState<'idle' | 'copied'>('idle');
  const [exportText, setExportText] = useState<string | null>(null);
  const exportMermaid = useCallback(async () => {
    const text = exportCanvasMermaid(stateRef.current, currentCanvas(navRef.current));
    try {
      await navigator.clipboard.writeText(text);
      setExportState('copied');
      setTimeout(() => setExportState('idle'), 1500);
    } catch {
      setExportText(text);
    }
  }, []);

  const showBanner = useCallback((text: string) => {
    setBanner(text);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 5000);
  }, []);

  const send = useCallback((msg: ChatClientMessage) => {
    wsRef.current?.sendMessage(msg as never);
  }, []);

  const compactChats = useCallback(
    (chatIds: string[]) => {
      const canvasId = currentCanvas(navRef.current);
      send({ type: 'chat_compact_requested', chatIds, ...(canvasId !== ROOT_CANVAS_ID ? { canvasId } : {}) });
    },
    [send],
  );

  const refreshCrumbs = useCallback(() => {
    const next = breadcrumbItems(stateRef.current, navRef.current);
    setCrumbs((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  const exportSelectedBranch = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const selected = editor
      .getSelectedShapes()
      .find((s) => s.type === 'chat-node') as ChatShape | undefined;
    if (!selected) return; // nothing selected -> no-op
    const chatId = selected.props.chatId;
    const view = stateRef.current.chats[chatId];
    const md = exportBranchMarkdown(stateRef.current, chatId);
    const name = (view?.title || chatId || 'chat').replace(/[^\w.-]+/g, '_');
    downloadFile(md, `${name}.md`, 'text/markdown');
  }, []);

  /** The tldraw page for a canvas, created on first visit. */
  const ensurePage = useCallback((editor: Editor, canvasId: string): TLPageId => {
    if (canvasId === ROOT_CANVAS_ID) return mainPageIdRef.current ?? editor.getCurrentPageId();
    const pageId = PageRecordType.createId(canvasPageSlug(canvasId));
    if (!editor.getPage(pageId)) {
      editor.run(() => editor.createPage({ id: pageId, name: stateRef.current.docs[canvasId]?.title || 'Canvas' }), SERVER_DRIVEN);
    }
    return pageId;
  }, []);

  const canvasIdForPage = useCallback((pageId: TLPageId): string | null => {
    if (pageId === mainPageIdRef.current) return ROOT_CANVAS_ID;
    return canvasIdForPageSlug(String(pageId).replace(/^page:/, ''));
  }, []);

  /** Make the current canvas's page match the store: diff desired fcw shapes
   *  against what's there. Fcw shapes for this canvas sitting on another page
   *  (a chat that moved canvases) are removed there first. */
  const syncCanvas = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const state = stateRef.current;
    const canvasId = currentCanvas(navRef.current);
    const pageId = ensurePage(editor, canvasId);
    const proj = projectCanvas(state, canvasId);

    const wantChats = new Map(proj.chats.map((c) => [chatShapeId(c.chatId), c]));
    const wantDocs = new Map(proj.docs.map((d) => [docShapeId(canvasId, d.docId), d]));
    const wantCtx = new Set(proj.chatEdges.map((e) => `${e.from}->${e.to}`));
    const wantDocEdges = new Map(proj.docEdges.map((e) => [docEdgeArrowId(canvasId, e.from, e.to), e]));

    syncingRef.current = true;
    try {
      editor.run(() => {
        const strays: TLShapeId[] = [];
        for (const s of allFcwShapes(editor)) {
          const here = editor.getAncestorPageId(s) === pageId;
          if (s.type === 'chat-node') {
            if (here !== wantChats.has(s.id)) strays.push(s.id);
          } else if (s.type === 'doc-node') {
            if (here && !wantDocs.has(s.id)) strays.push(s.id);
          } else if (s.meta?.fcwCtx) {
            const wanted = wantCtx.has(`${s.meta.from}->${s.meta.to}`);
            if (here !== wanted) strays.push(s.id);
          } else if (s.meta?.fcwDocEdge) {
            if (here && !wantDocEdges.has(s.id)) strays.push(s.id);
          }
        }
        if (strays.length > 0) editor.deleteShapes(strays);

        // Positions come from the store; only move a shape when the stored
        // position changed (meta sx/sy), so a sync never yanks a dragged shape.
        const upsert = (
          id: TLShapeId,
          type: 'chat-node' | 'doc-node',
          position: Position,
          props: Record<string, unknown>,
          meta: Record<string, string>,
        ) => {
          const nextMeta = { ...meta, sx: position.x, sy: position.y };
          const existing = editor.getShape(id);
          if (!existing) {
            editor.createShape({ id, type, parentId: pageId, x: position.x, y: position.y, props, meta: nextMeta });
            return;
          }
          const moved = existing.meta?.sx !== position.x || existing.meta?.sy !== position.y;
          editor.updateShape({ id, type, props, meta: nextMeta, ...(moved ? { x: position.x, y: position.y } : {}) });
        };

        for (const [id, c] of wantChats) {
          upsert(id, 'chat-node', c.position, chatProps(state.chats[c.chatId], state), { canvasId });
        }
        for (const [id, d] of wantDocs) {
          upsert(id, 'doc-node', d.position, { docId: d.docId, modelJson: JSON.stringify({ ...d.model, linkTo: d.linkTo }) }, {
            canvasId,
            docId: d.docId,
          });
        }

        for (const e of proj.chatEdges) {
          if (findCtxArrow(editor, e.from, e.to)) continue; // ours, or an adopted hand-drawn one
          const arrowId = ctxArrowId(e.from, e.to);
          editor.createShape({
            id: arrowId,
            type: 'arrow',
            parentId: pageId,
            meta: { fcwCtx: true, from: e.from, to: e.to },
            props: { dash: 'dashed', color: 'blue', size: 's' },
          });
          bindArrow(editor, arrowId, chatShapeId(e.from), chatShapeId(e.to));
        }
        for (const [arrowId, e] of wantDocEdges) {
          if (editor.getShape(arrowId)) continue;
          editor.createShape({
            id: arrowId,
            type: 'arrow',
            parentId: pageId,
            meta: { fcwDocEdge: true },
            props: { color: 'grey', size: 's' },
          });
          bindArrow(editor, arrowId, docShapeId(canvasId, e.from), docShapeId(canvasId, e.to));
        }
      }, SERVER_DRIVEN);
    } finally {
      syncingRef.current = false;
    }
    refreshCrumbs();
  }, [ensurePage, refreshCrumbs]);

  /** Switch the view to the top of `stack`. */
  const navigate = useCallback(
    (stack: NavStack) => {
      const editor = editorRef.current;
      if (!editor) return;
      navRef.current = stack;
      const pageId = ensurePage(editor, currentCanvas(stack));
      if (editor.getCurrentPageId() !== pageId) editor.setCurrentPage(pageId);
      syncCanvas();
    },
    [ensurePage, syncCanvas],
  );

  /** Lay out freshly generated diagram boxes in the visible area; the
   *  server's doc_moved echoes put them in place. */
  const runPendingLayout = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    let state = stateRef.current;
    for (const job of state.pendingLayout) {
      const laid = layoutDocNodes(job.docIds.map((id) => ({ id })), job.edges);
      const placed = centerLayoutAt(laid, editor.getViewportPageBounds().center);
      for (const [id, position] of placed) {
        send({ type: 'doc_move_requested', canvasId: job.canvasId, kind: 'doc', id, position });
      }
      state = clearPendingLayout(state, job.canvasId);
    }
    stateRef.current = state;
  }, [send]);

  /** Prompt bar: Diagram -> diagram on this canvas; Chat -> a new chat at the
   *  viewport centre, prompted once chat_created arrives. */
  const submitPrompt = useCallback(
    (mode: PromptMode, text: string) => {
      const canvasId = currentCanvas(navRef.current);
      if (mode === 'diagram') {
        send({ type: 'diagram_requested', canvasId, prompt: text });
        return;
      }
      const center = editorRef.current?.getViewportPageBounds().center ?? { x: 0, y: 0 };
      if (mode === 'doc') {
        send({ type: 'doc_create_requested', canvasId, title: text.trim(), position: center });
        return;
      }
      const position = { x: center.x - 180, y: center.y - 210 };
      pendingPromptsRef.current.push({ content: text, canvasId, position });
      send({ type: 'chat_create_requested', position });
    },
    [send],
  );

  const zoomToChat = useCallback(
    (chatId: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const state = stateRef.current;
      const canvasId =
        Object.keys(state.docs).find((docId) => chatIdsOn(state, docId).includes(chatId)) ?? ROOT_CANVAS_ID;
      if (canvasId !== currentCanvas(navRef.current)) navigate(pathToRoot(state, canvasId));
      const id = chatShapeId(chatId);
      if (!editor.getShape(id)) return;
      editor.select(id);
      editor.zoomToSelection({ animation: { duration: 200 } });
    },
    [navigate],
  );

  const handleServerMessage = useCallback(
    (msg: ChatServerMessage) => {
      if ((msg as { type: string }).type === 'error') {
        showBanner((msg as unknown as { message: string }).message);
        return;
      }
      const next = applyChatMessage(stateRef.current, msg);
      if (msg.type !== 'chat_snapshot' && next === stateRef.current) return;
      stateRef.current = next;
      if (panelDocIdRef.current) setPanelState(next);
      if (
        msg.type === 'project_list' ||
        msg.type === 'project_opened' ||
        msg.type === 'chat_snapshot' ||
        msg.type === 'chat_capabilities'
      ) {
        setMenuState(next);
      }
      if (msg.type !== 'chat_stream_delta') {
        const list = archivedChats(next).map((c) => ({ id: c.id, title: c.title }));
        setArchived((prev) => (JSON.stringify(prev) === JSON.stringify(list) ? prev : list));
      }

      if (msg.type === 'project_list' && pendingCreateRef.current) {
        // The server lists a new project without opening it: open it here.
        const { title, before } = pendingCreateRef.current;
        const id = createdProjectId(before, msg.projects, title);
        if (id) {
          pendingCreateRef.current = null;
          send({ type: 'project_open_requested', id });
        }
      }

      if (msg.type === 'project_opened') {
        // The tab now shows another graph: URL, nav, panels and canvas start over.
        const { pathname, search, hash } = window.location;
        window.history.replaceState(window.history.state, '', pathname + projectUrl(search, msg.project.id) + hash);
        navRef.current = [ROOT_CANVAS_ID];
        pendingPromptsRef.current = [];
        openPanel(null);
        setGraph(null);
        const ed = editorRef.current;
        const mainPage = mainPageIdRef.current;
        if (ed && mainPage) {
          syncingRef.current = true;
          try {
            ed.run(() => {
              if (ed.getCurrentPageId() !== mainPage) ed.setCurrentPage(mainPage);
              for (const page of ed.getPages()) if (page.id !== mainPage) ed.deletePage(page.id);
              ed.deleteShapes([...ed.getPageShapeIds(mainPage)]);
            }, SERVER_DRIVEN);
          } finally {
            syncingRef.current = false;
          }
        }
      }

      const editor = editorRef.current;
      if (!editor) return; // replayed on mount

      // Streaming is the hot path: touch only that card.
      if (msg.type === 'chat_stream_delta') {
        const id = chatShapeId(msg.chatId);
        const view = next.chats[msg.chatId];
        if (view && editor.getShape(id)) {
          syncingRef.current = true;
          try {
            editor.run(() => editor.updateShape<ChatShape>({ id, type: 'chat-node', props: chatProps(view, next) }), SERVER_DRIVEN);
          } finally {
            syncingRef.current = false;
          }
        }
        return;
      }

      runPendingLayout();
      syncCanvas();

      if (msg.type === 'chat_created') {
        // A chat the prompt bar asked for: place it (off root) and send the prompt.
        const pending = msg.chat.docId ? undefined : pendingPromptsRef.current.shift();
        if (pending) {
          const chatId = msg.chat.id;
          if (pending.canvasId !== ROOT_CANVAS_ID) {
            send({ type: 'doc_place_requested', canvasId: pending.canvasId, kind: 'chat', id: chatId, position: pending.position });
          }
          send({ type: 'chat_prompt_submitted', chatId, content: pending.content });
          return;
        }
        const id = chatShapeId(msg.chat.id);
        if (editor.getShape(id)) {
          editor.select(id);
          editor.setEditingShape(id);
        }
      }
    },
    [syncCanvas, runPendingLayout, showBanner, send, openPanel],
  );

  useEffect(() => {
    // M7.6: bind the socket to the page's project; re-read on reconnect.
    const ws = createWsClient(() => projectWsUrl(WS_URL, new URLSearchParams(window.location.search).get('project')));
    wsRef.current = ws;
    ws.onMessage((msg) => handleServerMessage(msg as unknown as ChatServerMessage));
    registerChatActions({
      sendPrompt: (chatId, content, attachmentIds) =>
        send({ type: 'chat_prompt_submitted', chatId, content, attachmentIds }),
      requestBranch: (parentId, position) =>
        send({ type: 'chat_branch_requested', parentId, position }),
      stopStream: (chatId) => send({ type: 'chat_stop_requested', chatId }),
      regenerate: (chatId) => send({ type: 'chat_regenerate_requested', chatId }),
      updateSettings: (chatId, settings) =>
        send({ type: 'chat_settings_updated', chatId, settings }),
      permissionDecision: (chatId, requestId, behavior) =>
        send({ type: 'chat_permission_decision', chatId, requestId, behavior }),
      uploadAttachment: (file) => uploadAttachment(file),
      listDirs: (path) => listDirs(path),
      compact: compactChats,
    });
    registerDocActions({
      openCanvas: (docId) => navigate(pushCanvas(navRef.current, docId)),
      regenerate: (docId) => send({ type: 'doc_regenerate_requested', docId }),
      select: (docId) => editorRef.current?.select(docShapeId(currentCanvas(navRef.current), docId)),
      link: (placedDocId, existingDocId) =>
        send({ type: 'doc_link_requested', canvasId: currentCanvas(navRef.current), placedDocId, existingDocId }),
    });
    return () => {
      registerChatActions(null);
      registerDocActions(null);
      ws.close();
      wsRef.current = null;
    };
  }, [handleServerMessage, send, navigate, compactChats]);

  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      mainPageIdRef.current = editor.getCurrentPageId();

      // A page switch we didn't make (tldraw's page menu): rebuild the
      // breadcrumb from the placements and resync that canvas.
      const stopPageListen = editor.store.listen(
        () => {
          const canvasId = canvasIdForPage(editor.getCurrentPageId());
          if (canvasId === null || canvasId === currentCanvas(navRef.current)) return;
          navRef.current = pathToRoot(stateRef.current, canvasId);
          syncCanvas();
        },
        { scope: 'session', source: 'all' },
      );

      // Selecting a single doc box opens its side panel (closing is explicit).
      const stopSelectListen = editor.store.listen(
        () => {
          const only = editor.getOnlySelectedShape();
          if (only?.type !== 'doc-node') return;
          const docId = (only as DocShape).props.docId;
          if (docId && docId !== panelDocIdRef.current) openPanel(docId);
        },
        { scope: 'session', source: 'all' },
      );

      // The snapshot may have arrived before the editor mounted — replay it.
      runPendingLayout();
      syncCanvas();

      // Persist card/box positions after drags (debounced per shape).
      const moveTimers = new Map<string, ReturnType<typeof setTimeout>>();
      const schedulePersist = (key: string, fire: () => void) => {
        const existing = moveTimers.get(key);
        if (existing) clearTimeout(existing);
        moveTimers.set(
          key,
          setTimeout(() => {
            moveTimers.delete(key);
            fire();
          }, 500),
        );
      };
      editor.sideEffects.registerAfterChangeHandler('shape', (prev, next) => {
        if (syncingRef.current) return;
        if (prev.x === next.x && prev.y === next.y) return;
        const canvasId = String(next.meta?.canvasId ?? ROOT_CANVAS_ID);
        if (next.type === 'chat-node') {
          const chatId = (next as ChatShape).props.chatId;
          if (!chatId) return;
          schedulePersist(`chat:${chatId}`, () => {
            const shape = editor.getShape(next.id);
            if (!shape) return;
            const position = { x: shape.x, y: shape.y };
            send(
              canvasId === ROOT_CANVAS_ID
                ? { type: 'chat_move_requested', chatId, position }
                : { type: 'doc_move_requested', canvasId, kind: 'chat', id: chatId, position },
            );
          });
        } else if (next.type === 'doc-node') {
          const docId = (next as DocShape).props.docId;
          if (!docId) return;
          schedulePersist(`doc:${canvasId}:${docId}`, () => {
            const shape = editor.getShape(next.id);
            if (!shape) return;
            send({ type: 'doc_move_requested', canvasId, kind: 'doc', id: docId, position: { x: shape.x, y: shape.y } });
          });
        }
      });

      // Double-click on empty canvas -> new chat shape at that point.
      // Only on root: a chat created elsewhere would land on root.
      const container = editor.getContainer();
      const onDblClick = (e: MouseEvent) => {
        if (currentCanvas(navRef.current) !== ROOT_CANVAS_ID) return;
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
            editor.run(() => editor.deleteShape(a.id), SERVER_DRIVEN);
            syncingRef.current = false;
            return;
          }

          // Adopt the user's arrow in place: it stays exactly where they drew it,
          // restyled as a context edge. The server event is a no-op thanks to meta.
          syncingRef.current = true;
          editor.run(
            () =>
              editor.updateShape({
                id: a.id,
                type: 'arrow',
                meta: { fcwCtx: true, from, to },
                props: { dash: 'dashed', color: 'blue' },
              }),
            SERVER_DRIVEN,
          );
          syncingRef.current = false;
          send({ type: 'chat_connect_requested', from, to });
        };
        setTimeout(tryConvert, 150);
      });

      // User deletions (not ours) -> unplace / archive / disconnect. One user
      // delete removes several shapes; collect them so deletionIntents sees a
      // chat card together with its arrows. Side-effect handlers can fire more
      // than once per deletion, so dedupe briefly.
      const recentIntents = new Set<string>();
      let deleted: DeletedShape[] = [];
      editor.sideEffects.registerAfterDeleteHandler('shape', (shape) => {
        if (syncingRef.current) return;
        if (deleted.length === 0) {
          queueMicrotask(() => {
            const batch = deleted;
            deleted = [];
            for (const msg of deletionIntents(batch, ROOT_CANVAS_ID)) {
              const key = JSON.stringify(msg);
              if (recentIntents.has(key)) continue;
              recentIntents.add(key);
              setTimeout(() => recentIntents.delete(key), 500);
              send(msg);
            }
          });
        }
        deleted.push(shape as DeletedShape);
      });

      return () => {
        stopPageListen();
        stopSelectListen();
        container.removeEventListener('dblclick', onDblClick);
      };
    },
    [send, syncCanvas, runPendingLayout, canvasIdForPage, openPanel],
  );

  /** Fold the selected chat cards into a generated doc on the current canvas. */
  const compactSelection = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const chatIds = editor
      .getSelectedShapes()
      .filter((s): s is ChatShape => s.type === 'chat-node')
      .map((s) => s.props.chatId)
      .filter(Boolean);
    if (chatIds.length === 0) return;
    editor.selectNone();
    compactChats(chatIds);
  }, [compactChats]);

  const chatMenu: ChatMenuActions = {
    archive: (chatIds) => chatIds.forEach((chatId) => send({ type: 'chat_archive_requested', chatId })),
    requestDelete: setDeleteIds,
  };

  const chrome: ChromeSlots = {
    left: <ChatSearchBar getState={() => stateRef.current} onSelect={zoomToChat} />,
    top: (
      <>
        {/* Breadcrumb: how we got to this canvas; home walks back to root. */}
        <div
          data-testid="breadcrumb"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            padding: '6px 10px',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
            color: '#334155',
            boxShadow: '0 2px 8px rgba(15,23,42,0.1)',
          }}
        >
          <button
            data-testid="breadcrumb-home"
            title="Home"
            onClick={() => navigate([ROOT_CANVAS_ID])}
            style={crumbButton}
          >
            ⌂
          </button>
          {crumbs.map((c, i) => (
            <React.Fragment key={`${i}-${c.canvasId}`}>
              {i > 0 && <span style={{ color: '#94A3B8' }}>›</span>}
              {i === 0 ? (
                // The root crumb is the project menu; ⌂ walks back to root.
                <span data-testid="breadcrumb-item">
                  <ProjectMenu
                    project={menuState.project}
                    projects={menuState.projects}
                    fallbackLabel={c.label}
                    settings={menuState.projectSettings}
                    capabilities={menuState.capabilities}
                    listDirs={listDirs}
                    onOpen={(id) => send({ type: 'project_open_requested', id })}
                    onCreate={(title) => {
                      pendingCreateRef.current = { title, before: stateRef.current.projects };
                      send({ type: 'project_create_requested', title });
                    }}
                    onRename={(id, title) => send({ type: 'project_rename_requested', id, title })}
                    onSaveSettings={(id, settings) => {
                      send({ type: 'project_settings_requested', id, settings });
                      // The server doesn't echo settings; keep the prefill current.
                      stateRef.current = { ...stateRef.current, projectSettings: settings };
                      setMenuState(stateRef.current);
                    }}
                    onTrash={(id) => send({ type: 'project_trash_requested', id })}
                  />
                </span>
              ) : (
                <button
                  data-testid="breadcrumb-item"
                  onClick={() => navigate(popTo(navRef.current, i))}
                  style={{ ...crumbButton, fontWeight: i === crumbs.length - 1 ? 700 : 500 }}
                >
                  {c.label}
                </button>
              )}
            </React.Fragment>
          ))}
          <button
            data-testid="global-graph-toggle"
            title="Global graph"
            onClick={() => setGraph(globalGraph(stateRef.current))}
            style={{ ...crumbButton, marginLeft: 8, color: '#475569' }}
          >
            Graph
          </button>
          <button
            data-testid="export-mermaid"
            title="Copy this canvas as Mermaid"
            onClick={exportMermaid}
            style={{ ...crumbButton, marginLeft: 4, color: '#475569' }}
          >
            {exportState === 'copied' ? 'Copied' : 'Export Mermaid'}
          </button>
        </div>
        {banner && (
          <div
            style={{
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
        {exportText !== null && (
          <div
            data-testid="export-mermaid-fallback"
            style={{
              background: '#fff',
              border: '1px solid #CBD5E1',
              borderRadius: 8,
              padding: 10,
              boxShadow: '0 2px 10px rgba(15,23,42,0.18)',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 12,
            }}
          >
            <div style={{ marginBottom: 6 }}>Clipboard unavailable. Copy the Mermaid below.</div>
            <textarea readOnly value={exportText} rows={8} style={{ width: 360, fontFamily: 'monospace' }} onFocus={(e) => e.currentTarget.select()} />
            <div style={{ textAlign: 'right' }}>
              <button onClick={() => setExportText(null)} style={crumbButton}>
                Close
              </button>
            </div>
          </div>
        )}
      </>
    ),
    right: (
      <div data-testid="canvas-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <ArchivedChats
          chats={archived}
          onRestore={(chatId) => send({ type: 'chat_unarchive_requested', chatId })}
          onDelete={(chatId) => send({ type: 'chat_delete_requested', chatId })}
        />
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
        <button
          onClick={exportSelectedBranch}
          title="Export the selected chat (with inherited context) as Markdown"
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
          Export
        </button>
        <button
          onClick={compactSelection}
          title="Compact the selected chats into an editable document node"
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #C4B5FD',
            background: '#7C3AED',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(88,28,135,0.2)',
          }}
        >
          Compact
        </button>
      </div>
    ),
  };

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {/* The canvas and its chrome shrink beside an open doc panel instead of hiding under it. */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: panelDocId ? DOC_PANEL_WIDTH : 0 }}>
        <ChromeContext.Provider value={chrome}>
          <ChatMenuContext.Provider value={chatMenu}>
            <Tldraw shapeUtils={customShapes} components={chromeComponents} onMount={onMount} />
          </ChatMenuContext.Provider>
        </ChromeContext.Provider>
        {/* Prompt dock, bottom centre above tldraw's toolbar, with the usage hint under it. */}
        <div
          data-testid="prompt-dock"
          style={{
            position: 'absolute',
            bottom: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <PromptBar onSubmit={submitPrompt} />
          <div
            data-testid="canvas-hint"
            style={{ pointerEvents: 'none', fontFamily: 'system-ui, sans-serif', fontSize: 11, color: '#64748B' }}
          >
            double-click: new · + : branch · drag arrow: connect
          </div>
        </div>
      </div>
      {deleteIds && (
        <div
          data-testid="chat-delete-dialog"
          style={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1003,
            background: '#fff',
            border: '1px solid #FECACA',
            borderRadius: 8,
            padding: '10px 14px',
            boxShadow: '0 4px 14px rgba(15,23,42,0.16)',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
            color: '#334155',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span>
            Delete {deleteIds.length === 1 ? 'this chat' : `${deleteIds.length} chats`} permanently? This cannot be undone.
          </span>
          <button data-testid="chat-delete-cancel" onClick={() => setDeleteIds(null)} style={{ ...crumbButton, fontWeight: 600 }}>
            Cancel
          </button>
          <button
            data-testid="chat-delete-confirm"
            onClick={() => {
              deleteIds.forEach((chatId) => send({ type: 'chat_delete_requested', chatId }));
              setDeleteIds(null);
            }}
            style={{ ...crumbButton, fontWeight: 600, color: '#B91C1C' }}
          >
            Delete
          </button>
        </div>
      )}
      {graph && (
        <GlobalGraph
          graph={graph}
          onClose={() => setGraph(null)}
          onPick={(docId) => {
            setGraph(null);
            navigate(pathToRoot(stateRef.current, docId));
          }}
        />
      )}
      {panelDocId && (
        <DocPanel
          state={panelState}
          docId={panelDocId}
          onClose={() => openPanel(null)}
          onBodyChange={(body) => send({ type: 'doc_update_requested', docId: panelDocId, body })}
          onRequestChat={() => send({ type: 'doc_chat_requested', docId: panelDocId })}
          onApply={(chatId, messageIndex) =>
            send({ type: 'doc_apply_requested', docId: panelDocId, chatId, messageIndex })
          }
        />
      )}
    </div>
  );
}
