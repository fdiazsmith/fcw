// The stream abstraction shared by the api and agent engines. A turn is a
// single assistant response; adapters emit TurnEvents, the session manager
// turns those into WS ChatServerMessages.
import type { ChatMessage, ChatSettings, Attachment } from '@fcw/graph-core';

export type TurnEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use'; toolUseId: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string }
  | { type: 'permission_request'; requestId: string; toolName: string; input: unknown };

export interface PermissionDecision {
  behavior: 'allow' | 'deny';
  message?: string;
}

export interface TurnContext {
  /** Assembled ancestor + own history, INCLUDING the just-appended user prompt. */
  context: ChatMessage[];
  /** The new user prompt text for this turn (last entry of context). */
  latest: string;
  settings: ChatSettings;
  /** Live agent session id, or undefined to start fresh with a preamble. */
  sessionId?: string;
  attachments: Attachment[];
  waitForPermission(requestId: string): Promise<PermissionDecision>;
  signal: AbortSignal;
}

export type StreamTurnFn = (ctx: TurnContext) => AsyncIterable<TurnEvent>;
