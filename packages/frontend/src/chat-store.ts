// v2 frontend state: pure reducer over chat server messages.
import type {
  ChatServerMessage,
  ChatGraph,
  ChatMessage,
  ChatNode,
  ContextEdge,
  ChatSettings,
  CapabilityModel,
  CapabilityCommand,
  Doc,
  DocCanvas,
  DocEdge,
  DocPlacement,
  ProjectSummary,
  TokenUsage,
} from '@fcw/graph-core';
import { linkPlacement, ROOT_CANVAS_ID } from '@fcw/graph-core';

export interface PendingPermission {
  requestId: string;
  toolName: string;
  input: unknown;
}

export interface ChatView {
  id: string;
  title: string;
  position: { x: number; y: number };
  messages: ChatMessage[];
  streamingText: string | null;
  error: string | null;
  settings: ChatSettings;
  /** Head of the queue — what the permission banner shows. */
  pendingPermission: PendingPermission | null;
  /** All unresolved permission prompts for this chat, oldest first. */
  pendingPermissionQueue: PendingPermission[];
  /** Accumulated token usage across turns, or null before the first turn. */
  usage: TokenUsage | null;
  /** Enabled incoming context edges at the last usage update. */
  contextChats: number;
  /** Hidden from every canvas; listed in the Archived drawer. */
  archived?: boolean;
}

export interface Capabilities {
  models: CapabilityModel[];
  commands: CapabilityCommand[];
}

export interface ChatState {
  chats: Record<string, ChatView>;
  edges: ContextEdge[];
  capabilities: Capabilities;
  /** The global doc table — mirrors the server's ChatGraph.docs. */
  docs: Record<string, Doc>;
  rootCanvas: DocCanvas;
  /** docId -> its doc-chat (chats with `docId`; never rendered on a canvas). */
  docChats: Record<string, string>;
  /** Diagram boxes awaiting layout; the canvas UI consumes via clearPendingLayout. */
  pendingLayout: { canvasId: string; docIds: string[]; edges: DocEdge[] }[];
  /** The project this tab is bound to (M7.6). */
  project?: ProjectSummary;
  /** Every project, for the project menu. */
  projects: ProjectSummary[];
  /** The open project's defaults for new chats (from the snapshot). */
  projectSettings?: ChatGraph['meta']['settings'];
}

export function emptyChatState(): ChatState {
  return {
    chats: {},
    edges: [],
    capabilities: { models: [], commands: [] },
    docs: {},
    rootCanvas: { placements: [], edges: [] },
    docChats: {},
    pendingLayout: [],
    projects: [],
  };
}

function viewFrom(chat: ChatNode): ChatView {
  return {
    id: chat.id,
    title: chat.title,
    position: chat.position,
    messages: [...chat.messages],
    streamingText: null,
    error: null,
    settings: chat.settings ?? { engine: 'api' },
    pendingPermission: null,
    pendingPermissionQueue: [],
    usage: chat.usage ?? null,
    contextChats: 0,
    archived: chat.archived === true,
  };
}

/** Drop the queued diagram layouts for a canvas once the UI has run them. */
export function clearPendingLayout(state: ChatState, canvasId: string): ChatState {
  return { ...state, pendingLayout: state.pendingLayout.filter((p) => p.canvasId !== canvasId) };
}

/** The canvas with this id: root, or a doc's own canvas. */
export function canvasById(state: ChatState, canvasId: string): DocCanvas | undefined {
  return canvasId === ROOT_CANVAS_ID ? state.rootCanvas : state.docs[canvasId]?.canvas;
}

export function placementsOn(state: ChatState, canvasId: string): DocPlacement[] {
  return canvasById(state, canvasId)?.placements ?? [];
}

/** Every canvas (root or doc id) that places this doc — powers the link badge. */
export function canvasesPlacing(state: ChatState, docId: string): string[] {
  const ids: string[] = [];
  if (state.rootCanvas.placements.some((p) => isPlacement(p, 'doc', docId))) ids.push(ROOT_CANVAS_ID);
  for (const doc of Object.values(state.docs)) {
    if (doc.canvas.placements.some((p) => isPlacement(p, 'doc', docId))) ids.push(doc.id);
  }
  return ids;
}

/** Chats on root: placed on no doc canvas, not archived, and not a doc-chat
 *  (those never render on a canvas). */
export function rootChatIds(state: ChatState): string[] {
  const docChatIds = new Set(Object.values(state.docChats));
  const placed = new Set<string>();
  for (const doc of Object.values(state.docs)) {
    for (const p of doc.canvas.placements) if (p.kind === 'chat') placed.add(p.id);
  }
  return Object.keys(state.chats).filter(
    (id) => !placed.has(id) && !docChatIds.has(id) && !state.chats[id].archived,
  );
}

/** Archived chats, for the Archived drawer. */
export function archivedChats(state: ChatState): ChatView[] {
  return Object.values(state.chats).filter((c) => c.archived);
}

export function chatIdsOn(state: ChatState, canvasId: string): string[] {
  if (canvasId === ROOT_CANVAS_ID) return rootChatIds(state);
  return placementsOn(state, canvasId)
    .filter((p) => p.kind === 'chat')
    .map((p) => p.id);
}

/** Replace one canvas (root or a doc's); unknown canvas ids leave state unchanged. */
function withCanvas(state: ChatState, canvasId: string, fn: (c: DocCanvas) => DocCanvas): ChatState {
  if (canvasId === ROOT_CANVAS_ID) return { ...state, rootCanvas: fn(state.rootCanvas) };
  const doc = state.docs[canvasId];
  if (!doc) return state;
  return { ...state, docs: { ...state.docs, [canvasId]: { ...doc, canvas: fn(doc.canvas) } } };
}

const isPlacement = (p: DocPlacement, kind: DocPlacement['kind'], id: string) =>
  p.kind === kind && p.id === id;

export function applyChatMessage(state: ChatState, msg: ChatServerMessage): ChatState {
  if (msg.type === 'project_list') {
    const current = state.project && msg.projects.find((p) => p.id === state.project?.id);
    return { ...state, projects: msg.projects, ...(current ? { project: current } : {}) };
  }

  if (msg.type === 'project_opened') {
    // A fresh graph follows as chat_snapshot; capabilities are per server, not per project.
    return { ...emptyChatState(), capabilities: state.capabilities, projects: state.projects, project: msg.project };
  }

  if (msg.type === 'chat_snapshot') {
    const chats: Record<string, ChatView> = {};
    for (const chat of Object.values(msg.graph.chats)) {
      // Permission prompts are runtime state, not graph state — a resync
      // must not drop a banner the server is still waiting on.
      const prev = state.chats[chat.id];
      chats[chat.id] = {
        ...viewFrom(chat),
        pendingPermission: prev?.pendingPermission ?? null,
        pendingPermissionQueue: prev?.pendingPermissionQueue ?? [],
      };
    }
    const docChats: Record<string, string> = {};
    for (const chat of Object.values(msg.graph.chats)) {
      if (chat.docId) docChats[chat.docId] = chat.id;
    }
    return {
      ...state,
      chats,
      docs: { ...(msg.graph.docs ?? {}) },
      rootCanvas: msg.graph.rootCanvas ?? { placements: [], edges: [] },
      docChats,
      edges: [...msg.graph.edges],
      projectSettings: msg.graph.meta?.settings,
    };
  }

  if (msg.type === 'chat_capabilities') {
    return { ...state, capabilities: { models: msg.models, commands: msg.commands } };
  }

  if (msg.type === 'chat_created') {
    return {
      ...state,
      chats: { ...state.chats, [msg.chat.id]: viewFrom(msg.chat) },
      docChats: msg.chat.docId ? { ...state.docChats, [msg.chat.docId]: msg.chat.id } : state.docChats,
    };
  }

  if (msg.type === 'chat_connected') {
    const exists = state.edges.some(
      (e) => e.from === msg.edge.from && e.to === msg.edge.to,
    );
    if (exists) return state;
    return { ...state, edges: [...state.edges, msg.edge] };
  }

  if (msg.type === 'chat_disconnected') {
    return {
      ...state,
      edges: state.edges.filter((e) => !(e.from === msg.from && e.to === msg.to)),
    };
  }

  if (msg.type === 'chat_deleted') {
    if (!state.chats[msg.chatId]) return state;
    const { [msg.chatId]: _gone, ...chats } = state.chats;
    const dropChat = (c: DocCanvas): DocCanvas => ({
      ...c,
      placements: c.placements.filter((p) => !isPlacement(p, 'chat', msg.chatId)),
    });
    const docs: Record<string, Doc> = {};
    for (const [id, doc] of Object.entries(state.docs)) docs[id] = { ...doc, canvas: dropChat(doc.canvas) };
    return {
      ...state,
      chats,
      edges: state.edges.filter((e) => e.from !== msg.chatId && e.to !== msg.chatId),
      docs,
      rootCanvas: dropChat(state.rootCanvas),
    };
  }

  if (msg.type === 'doc_created') {
    return { ...state, docs: { ...state.docs, [msg.doc.id]: msg.doc } };
  }

  if (msg.type === 'doc_updated') {
    const doc = state.docs[msg.docId];
    if (!doc) return state;
    const { type: _type, docId: _docId, ...patch } = msg;
    return { ...state, docs: { ...state.docs, [msg.docId]: { ...doc, ...patch } } };
  }

  if (msg.type === 'doc_placed') {
    return withCanvas(state, msg.canvasId, (c) => ({ ...c, placements: [...c.placements, msg.placement] }));
  }

  if (msg.type === 'doc_unplaced') {
    return withCanvas(state, msg.canvasId, (c) => ({
      ...c,
      placements: c.placements.filter((p) => !isPlacement(p, msg.kind, msg.id)),
    }));
  }

  if (msg.type === 'doc_moved') {
    return withCanvas(state, msg.canvasId, (c) => ({
      ...c,
      placements: c.placements.map((p) => (isPlacement(p, msg.kind, msg.id) ? { ...p, position: msg.position } : p)),
    }));
  }

  if (msg.type === 'doc_linked') {
    // Mirrors ChatSession.linkDoc: swap the placement, then drop the replaced
    // doc if it is an empty orphan (no body, empty canvas, unplaced, no doc-chat).
    const canvas = canvasById(state, msg.canvasId);
    if (!canvas) return state;
    let linked: DocCanvas;
    try {
      linked = linkPlacement(state, canvas, msg.placedDocId, msg.existingDocId);
    } catch {
      return state;
    }
    const next = withCanvas(state, msg.canvasId, () => linked);
    const replaced = next.docs[msg.placedDocId];
    const placedAnywhere = [next.rootCanvas, ...Object.values(next.docs).map((d) => d.canvas)].some((c) =>
      c.placements.some((p) => isPlacement(p, 'doc', msg.placedDocId)),
    );
    if (
      replaced &&
      replaced.body === '' &&
      replaced.canvas.placements.length === 0 &&
      replaced.canvas.edges.length === 0 &&
      !placedAnywhere &&
      !next.docChats[msg.placedDocId]
    ) {
      const { [msg.placedDocId]: _gone, ...docs } = next.docs;
      return { ...next, docs };
    }
    return next;
  }

  if (msg.type === 'diagram_created') {
    // The server already put these edges on its canvas; mirror them once.
    const next = withCanvas(state, msg.canvasId, (c) => ({
      ...c,
      edges: [
        ...c.edges,
        ...msg.edges.filter((e) => !c.edges.some((x) => x.from === e.from && x.to === e.to)),
      ],
    }));
    if (next === state) return state;
    return {
      ...next,
      pendingLayout: [...next.pendingLayout, { canvasId: msg.canvasId, docIds: msg.docIds, edges: msg.edges }],
    };
  }

  if (msg.type === 'doc_chat_ready') {
    return { ...state, docChats: { ...state.docChats, [msg.docId]: msg.chatId } };
  }

  if (!('chatId' in msg)) return state;

  const existing = state.chats[msg.chatId];
  if (!existing) return state;

  const update = (patch: Partial<ChatView>): ChatState => ({
    ...state,
    chats: { ...state.chats, [msg.chatId]: { ...existing, ...patch } },
  });

  switch (msg.type) {
    case 'chat_user_message':
      return update({ messages: [...existing.messages, msg.message], error: null });
    case 'chat_tool_message':
      return update({ messages: [...existing.messages, msg.message] });
    case 'chat_settings_changed':
      return update({ settings: msg.settings });
    case 'chat_usage_updated':
      return update({ usage: msg.usage, contextChats: msg.contextChats });
    case 'chat_permission_requested': {
      if (existing.pendingPermissionQueue.some((p) => p.requestId === msg.requestId)) return state;
      const queue = [
        ...existing.pendingPermissionQueue,
        { requestId: msg.requestId, toolName: msg.toolName, input: msg.input },
      ];
      return update({ pendingPermissionQueue: queue, pendingPermission: queue[0] });
    }
    case 'chat_permission_resolved': {
      if (!existing.pendingPermissionQueue.some((p) => p.requestId === msg.requestId)) return state;
      const queue = existing.pendingPermissionQueue.filter((p) => p.requestId !== msg.requestId);
      return update({ pendingPermissionQueue: queue, pendingPermission: queue[0] ?? null });
    }
    case 'chat_stream_started':
      return update({ streamingText: '', error: null });
    case 'chat_stream_delta':
      return update({ streamingText: (existing.streamingText ?? '') + msg.delta });
    case 'chat_stream_completed':
      return update({ streamingText: null, messages: [...existing.messages, msg.message] });
    case 'chat_archived_changed':
      return update({ archived: msg.archived });
    case 'chat_title_changed':
      return update({ title: msg.title });
    case 'chat_last_message_removed':
      return update({ messages: existing.messages.slice(0, -1) });
    case 'chat_error':
      return update({ streamingText: null, error: msg.message });
    default:
      return state;
  }
}
